import path from "node:path";

import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { DustFileSystem, parseScopedPrefix } from "@app/lib/api/file_system";
import { withFrameSourceLock } from "@app/lib/api/frames/operation_lock";
import type { FramePublicationError } from "@app/lib/api/frames/publication_storage";
import { publishFrameV2FromSourceWithLockHeld } from "@app/lib/api/frames/publish_from_source";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLock } from "@app/lib/lock";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { DustFileSystemError } from "@app/types/file_system";
import type { FileUseCase, FileUseCaseMetadata } from "@app/types/files";
import { frameV2ContentType, isInteractiveContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export class FrameV2ConversionError extends Error {
  constructor(
    readonly code: "conflict" | "internal" | "invalid_source",
    message: string
  ) {
    super(message);
    this.name = "FrameV2ConversionError";
  }
}

export function isFrameV2ConversionError(
  error: unknown
): error is FrameV2ConversionError {
  return error instanceof FrameV2ConversionError;
}

export type ConvertLegacyFrameToV2Error =
  | DustFileSystemError
  | FramePublicationError
  | FrameV2ConversionError
  | SandboxFunctionError;

export type ConvertLegacyFrameToV2Result = {
  frameId: string;
  manifestPath: string;
  publicationId: string;
};

type SourceOwner = {
  key: string;
  useCase: FileUseCase;
  useCaseMetadata: Pick<FileUseCaseMetadata, "conversationId" | "spaceId">;
};

type PendingFrameV2Conversion = NonNullable<
  FileUseCaseMetadata["pendingFrameV2Conversion"]
>;

function conversionError(
  code: FrameV2ConversionError["code"],
  message: string
) {
  return new Err(new FrameV2ConversionError(code, message));
}

function sourceOwner(scopedPath: string): SourceOwner | null {
  const parsed = parseScopedPrefix(scopedPath);
  if (!parsed) {
    return null;
  }

  switch (parsed.kind) {
    case "conversation":
      return {
        key: `${parsed.kind}:${parsed.id}`,
        useCase: "conversation",
        useCaseMetadata: { conversationId: parsed.id },
      };
    case "pod":
      return {
        key: `${parsed.kind}:${parsed.id}`,
        useCase: "project_context",
        useCaseMetadata: { spaceId: parsed.id },
      };
    case "user":
      return null;
  }
}

function convertedMetadata(
  frame: FileResource,
  owner: SourceOwner
): FileUseCaseMetadata {
  const {
    activePublicationId: _activePublicationId,
    conversationId: _conversationId,
    frameBundleRootPath: _frameBundleRootPath,
    frameEntryRelPath: _frameEntryRelPath,
    pendingFrameSourceMove: _pendingFrameSourceMove,
    pendingFrameV2Conversion: _pendingFrameV2Conversion,
    spaceId: _spaceId,
    ...stableMetadata
  } = frame.useCaseMetadata ?? {};

  return { ...stableMetadata, ...owner.useCaseMetadata };
}

function matchesPendingConversion(
  pending: PendingFrameV2Conversion | undefined,
  {
    manifest,
    manifestMountFilePath,
    source,
    sourceMountFilePath,
  }: {
    manifest: string;
    manifestMountFilePath: string;
    source: string;
    sourceMountFilePath: string;
  }
): pending is PendingFrameV2Conversion {
  return (
    pending?.manifestPath === manifest &&
    pending.manifestMountFilePath === manifestMountFilePath &&
    pending.sourcePath === source &&
    pending.legacyMountFilePath === sourceMountFilePath
  );
}

function emitFrameConvertedAuditEvent(
  auth: Authenticator,
  {
    frameId,
    manifestPath,
    publicationId,
    sourcePath,
  }: ConvertLegacyFrameToV2Result & { sourcePath: string }
) {
  void emitAuditLogEvent({
    auth,
    action: "frame.converted",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("frame", {
        sId: frameId,
        name: path.posix.basename(path.posix.dirname(manifestPath)),
      }),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      manifest_path: manifestPath,
      publication_id: publicationId,
      source_path: sourcePath,
    },
  });
}

/** Convert a legacy Frame in place, preserving its stable identity and use-rights rows. */
export async function convertLegacyFrameToV2(
  auth: Authenticator,
  {
    conversation,
    manifestPath,
    sourcePath,
  }: {
    conversation: ConversationWithoutContentType;
    manifestPath: string;
    sourcePath: string;
  }
): Promise<Result<ConvertLegacyFrameToV2Result, ConvertLegacyFrameToV2Error>> {
  const source = DustFileSystem.normalizeScopedPath(sourcePath);
  const manifest = DustFileSystem.normalizeScopedPath(manifestPath);
  if (
    !source ||
    !manifest ||
    path.posix.basename(manifest) !== FRAME_MANIFEST_FILE
  ) {
    return conversionError(
      "invalid_source",
      `Conversion requires a legacy entry file and a ${FRAME_MANIFEST_FILE} path.`
    );
  }

  const legacyOwner = sourceOwner(source);
  const targetOwner = sourceOwner(manifest);
  if (!legacyOwner || !targetOwner || legacyOwner.key !== targetOwner.key) {
    return conversionError(
      "invalid_source",
      "The legacy entry and v2 manifest must belong to the same conversation or Pod mount."
    );
  }

  const fsResult = await DustFileSystem.forAgentLoop(auth, {
    conversation,
    scopedPaths: [source, manifest],
  });
  if (fsResult.isErr()) {
    return fsResult;
  }
  const dustFs = fsResult.value;
  if (!dustFs.isGCSBacked()) {
    return conversionError(
      "invalid_source",
      "Frames v2 conversion does not support the database-backed filesystem."
    );
  }

  for (const scopedPath of [source, manifest]) {
    const access = dustFs.checkWriteAccess(scopedPath);
    if (access.isErr()) {
      return access;
    }
  }

  const sourceMountPath = dustFs.toMountFilePath(source);
  const manifestMountPath = dustFs.toMountFilePath(manifest);
  if (!sourceMountPath || !manifestMountPath) {
    return conversionError("invalid_source", "Invalid Frame source path.");
  }

  const candidates = await FileResource.fetchByMountFilePaths(auth, [
    sourceMountPath,
    manifestMountPath,
  ]);
  const candidate =
    candidates.find(
      (file) =>
        file.mountFilePath === sourceMountPath &&
        isInteractiveContentType(file.contentType)
    ) ??
    candidates.find(
      (file) =>
        file.mountFilePath === manifestMountPath &&
        file.isFrameV2 &&
        matchesPendingConversion(
          file.useCaseMetadata?.pendingFrameV2Conversion,
          {
            manifest,
            manifestMountFilePath: manifestMountPath,
            source,
            sourceMountFilePath: sourceMountPath,
          }
        )
    );
  if (!candidate) {
    return conversionError(
      "invalid_source",
      `No legacy Frame found at ${source}.`
    );
  }
  if (
    candidates.some(
      (file) =>
        file.id !== candidate.id && file.mountFilePath === manifestMountPath
    )
  ) {
    return conversionError(
      "conflict",
      "A registered file already uses the v2 manifest path."
    );
  }

  try {
    return await executeWithLock(`file:edit:${candidate.sId}`, () =>
      withFrameSourceLock<
        ConvertLegacyFrameToV2Result,
        ConvertLegacyFrameToV2Error
      >(candidate.sId, async () => {
        const frame = await FileResource.fetchById(auth, candidate.sId);
        if (!frame) {
          return conversionError(
            "conflict",
            "The legacy Frame was deleted while it was being converted."
          );
        }

        let pending = frame.useCaseMetadata?.pendingFrameV2Conversion;
        if (
          pending &&
          !matchesPendingConversion(pending, {
            manifest,
            manifestMountFilePath: manifestMountPath,
            source,
            sourceMountFilePath: sourceMountPath,
          })
        ) {
          return conversionError(
            "conflict",
            "The legacy Frame is already being converted from another source path."
          );
        }

        const activePublicationId = frame.useCaseMetadata?.activePublicationId;
        if (frame.isFrameV2 && pending && activePublicationId) {
          await frame.finishFrameV2Conversion();
          const result = {
            frameId: frame.sId,
            manifestPath: manifest,
            publicationId: activePublicationId,
          };
          emitFrameConvertedAuditEvent(auth, { ...result, sourcePath: source });
          return new Ok(result);
        }

        if (
          !pending &&
          (!isInteractiveContentType(frame.contentType) ||
            frame.mountFilePath !== sourceMountPath)
        ) {
          return conversionError(
            "conflict",
            "The legacy Frame changed while it was being converted; retry from its current path."
          );
        }

        const [registeredManifest] = await FileResource.fetchByMountFilePaths(
          auth,
          [manifestMountPath]
        );
        if (registeredManifest && registeredManifest.id !== frame.id) {
          return conversionError(
            "conflict",
            "A registered file already uses the v2 manifest path."
          );
        }

        const manifestBufferResult = await dustFs.readBuffer(manifest);
        if (manifestBufferResult.isErr()) {
          return manifestBufferResult;
        }
        if (!manifestBufferResult.value) {
          return conversionError(
            "invalid_source",
            `Frame manifest not found: ${manifest}`
          );
        }
        const manifestBuffer = manifestBufferResult.value;

        if (!pending) {
          if (!isInteractiveContentType(frame.contentType)) {
            return conversionError(
              "conflict",
              "The legacy Frame changed while it was being converted; retry from its current path."
            );
          }
          const legacyMetadata = convertedMetadata(frame, legacyOwner);
          pending = {
            legacyContentType: frame.contentType,
            legacyFileName: frame.fileName,
            legacyFileSize: frame.fileSize,
            legacyMountFilePath: sourceMountPath,
            legacyRenderableVersion: frame.useCaseMetadata?.frameBundleRootPath
              ? "processed"
              : "original",
            legacyUseCase: frame.useCase,
            legacyUseCaseMetadata: legacyMetadata,
            manifestMountFilePath: manifestMountPath,
            manifestPath: manifest,
            sourcePath: source,
          };

          try {
            await frame.updateFrameSourceBinding({
              contentType: frameV2ContentType,
              fileName: FRAME_MANIFEST_FILE,
              fileSize: manifestBuffer.length,
              mountFilePath: manifestMountPath,
              useCase: targetOwner.useCase,
              useCaseMetadata: {
                ...convertedMetadata(frame, targetOwner),
                pendingFrameV2Conversion: pending,
              },
            });
          } catch (error) {
            return conversionError(
              "internal",
              `Frame conversion failed: ${normalizeError(error).message}`
            );
          }
        }

        const restore = async (): Promise<boolean> => {
          try {
            await frame.updateFrameSourceBinding({
              contentType: pending.legacyContentType,
              fileName: pending.legacyFileName,
              fileSize: pending.legacyFileSize,
              mountFilePath: pending.legacyMountFilePath,
              useCase: pending.legacyUseCase,
              useCaseMetadata: pending.legacyUseCaseMetadata,
            });
            return true;
          } catch (error) {
            logger.error(
              {
                error: normalizeError(error),
                frameId: frame.sId,
                manifestPath: manifest,
                sourcePath: source,
              },
              "Failed to roll back a legacy Frame conversion"
            );
            return false;
          }
        };

        try {
          const publication = await publishFrameV2FromSourceWithLockHeld(auth, {
            capturedManifest: manifestBuffer,
            conversation,
            frame,
            manifestPath: manifest,
            requireNoDatabases: true,
          });
          if (publication.isErr()) {
            return (await restore())
              ? new Err(publication.error)
              : conversionError(
                  "internal",
                  "Frame conversion failed and its legacy source binding could not be restored."
                );
          }

          await frame.finishFrameV2Conversion();
          const result = {
            frameId: frame.sId,
            manifestPath: manifest,
            publicationId: publication.value.publicationId,
          };

          logger.info(
            {
              ...result,
              sourcePath: source,
              workspaceId: auth.getNonNullableWorkspace().sId,
            },
            "Converted legacy Frame to Frames v2"
          );
          emitFrameConvertedAuditEvent(auth, { ...result, sourcePath: source });
          return new Ok(result);
        } catch (error) {
          const currentFrame = await FileResource.fetchById(auth, frame.sId);
          if (currentFrame?.useCaseMetadata?.activePublicationId) {
            return conversionError(
              "internal",
              "Frame conversion was activated but not finalized; retry the conversion command."
            );
          }
          const restored = await restore();
          return conversionError(
            "internal",
            restored
              ? `Frame conversion failed: ${normalizeError(error).message}`
              : "Frame conversion failed and its legacy source binding could not be restored."
          );
        }
      })
    );
  } catch (error) {
    return conversionError(
      "internal",
      `Frame conversion failed: ${normalizeError(error).message}`
    );
  }
}
