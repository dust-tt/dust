import path from "node:path";

import { DustFileSystem, parseScopedPrefix } from "@app/lib/api/file_system";
import {
  FramePublicationError,
  withFrameSourceLock,
} from "@app/lib/api/frames/publication_storage";
import { publishFrameV2FromSourceWithLockHeld } from "@app/lib/api/frames/publish_from_source";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import {
  FRAME_MANIFEST_FILE,
  parseFrameManifest,
} from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { DustFileSystemError } from "@app/types/file_system";
import type {
  FileUseCase,
  FileUseCaseMetadata,
  FrameFileContentType,
} from "@app/types/files";
import { frameV2ContentType } from "@app/types/files";
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
    spaceId: _spaceId,
    ...stableMetadata
  } = frame.useCaseMetadata ?? {};

  return { ...stableMetadata, ...owner.useCaseMetadata };
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
  const parsedManifest = parseFrameManifest(manifestBuffer);
  if (parsedManifest.isErr()) {
    return new Err(
      new FramePublicationError("invalid_manifest", parsedManifest.error)
    );
  }
  if (parsedManifest.value.databases.length > 0) {
    return conversionError(
      "invalid_source",
      "Convert the legacy Frame before adding Frame-owned databases, then publish again."
    );
  }

  const candidates = await FileResource.fetchByMountFilePaths(auth, [
    sourceMountPath,
    manifestMountPath,
  ]);
  const legacyFrame = candidates.find(
    (candidate) => candidate.mountFilePath === sourceMountPath
  );
  if (!legacyFrame?.isInteractiveContent || legacyFrame.isFrameV2) {
    return conversionError(
      "invalid_source",
      `No legacy Frame found at ${source}.`
    );
  }
  if (
    candidates.some(
      (candidate) => candidate.mountFilePath === manifestMountPath
    )
  ) {
    return conversionError(
      "conflict",
      "A registered file already uses the v2 manifest path."
    );
  }

  return withFrameSourceLock<
    ConvertLegacyFrameToV2Result,
    ConvertLegacyFrameToV2Error
  >(legacyFrame.sId, async () => {
    const frame = await FileResource.fetchById(auth, legacyFrame.sId);
    if (
      !frame?.isInteractiveContent ||
      frame.isFrameV2 ||
      frame.mountFilePath !== sourceMountPath
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
    if (registeredManifest) {
      return conversionError(
        "conflict",
        "A registered file already uses the v2 manifest path."
      );
    }

    const original = {
      contentType: frame.contentType as FrameFileContentType,
      fileName: frame.fileName,
      fileSize: frame.fileSize,
      mountFilePath: sourceMountPath,
      useCase: frame.useCase,
      useCaseMetadata: frame.useCaseMetadata ?? {},
    };
    const restore = async (): Promise<boolean> => {
      try {
        await frame.updateFrameSourceBinding(original);
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
      await frame.updateFrameSourceBinding({
        contentType: frameV2ContentType,
        fileName: FRAME_MANIFEST_FILE,
        fileSize: manifestBuffer.length,
        mountFilePath: manifestMountPath,
        useCase: targetOwner.useCase,
        useCaseMetadata: convertedMetadata(frame, targetOwner),
      });

      const publication = await publishFrameV2FromSourceWithLockHeld(auth, {
        conversation,
        frame,
        manifestPath: manifest,
      });
      if (publication.isErr()) {
        return (await restore())
          ? new Err(publication.error)
          : conversionError(
              "internal",
              "Frame conversion failed and its legacy source binding could not be restored."
            );
      }

      logger.info(
        {
          frameId: frame.sId,
          manifestPath: manifest,
          publicationId: publication.value.publicationId,
          sourcePath: source,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "Converted legacy Frame to Frames v2"
      );

      return new Ok({
        frameId: frame.sId,
        manifestPath: manifest,
        publicationId: publication.value.publicationId,
      });
    } catch (error) {
      const restored = await restore();
      return conversionError(
        "internal",
        restored
          ? `Frame conversion failed: ${normalizeError(error).message}`
          : "Frame conversion failed and its legacy source binding could not be restored."
      );
    }
  });
}
