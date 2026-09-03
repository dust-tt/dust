import path from "node:path";

import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { DustFileSystem } from "@app/lib/api/file_system";
import {
  getConvertedFrameMetadata,
  getFrameSourceOwner,
} from "@app/lib/api/frames/conversion_primitives";
import {
  withFrameSourceLock,
  withLegacyFrameMutationLock,
} from "@app/lib/api/frames/operation_lock";
import type { FramePublicationError } from "@app/lib/api/frames/publication_storage";
import {
  captureFrameV2SourceSnapshot,
  publishFrameV2FromSourceWithLockHeld,
} from "@app/lib/api/frames/publish_from_source";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import type { LockAcquisitionTimeoutError } from "@app/lib/lock";
import { isLockAcquisitionTimeoutError } from "@app/lib/lock";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { DustFileSystemError } from "@app/types/file_system";
import type { FileUseCaseMetadata } from "@app/types/files";
import { frameV2ContentType, isInteractiveContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { UniqueConstraintError } from "sequelize";

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

function conversionError(
  code: FrameV2ConversionError["code"],
  message: string
) {
  return new Err(new FrameV2ConversionError(code, message));
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

type PendingConversion = NonNullable<
  FileUseCaseMetadata["pendingFrameV2Conversion"]
>;

function matchesPendingConversion(
  pending: PendingConversion | undefined,
  paths: {
    manifest: string;
    manifestMountPath: string;
    source: string;
    sourceMountPath: string;
  }
): pending is PendingConversion {
  return (
    pending?.manifestPath === paths.manifest &&
    pending.manifestMountFilePath === paths.manifestMountPath &&
    pending.sourcePath === paths.source &&
    pending.legacyMountFilePath === paths.sourceMountPath
  );
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

  const legacyOwner = getFrameSourceOwner(source);
  const targetOwner = getFrameSourceOwner(manifest);
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
  const frameCandidate =
    candidates.find(
      (file) =>
        file.mountFilePath === sourceMountPath &&
        file.isInteractiveContent &&
        !file.isFrameV2
    ) ??
    candidates.find(
      (file) =>
        file.mountFilePath === manifestMountPath &&
        file.isFrameV2 &&
        matchesPendingConversion(
          file.useCaseMetadata?.pendingFrameV2Conversion,
          { manifest, manifestMountPath, source, sourceMountPath }
        )
    );
  if (!frameCandidate) {
    return conversionError(
      "invalid_source",
      `No legacy Frame found at ${source}.`
    );
  }
  if (
    candidates.some(
      (file) =>
        file.id !== frameCandidate.id &&
        file.mountFilePath === manifestMountPath
    )
  ) {
    return conversionError(
      "conflict",
      "A registered file already uses the v2 manifest path."
    );
  }

  const convertWithSourceLock = async () => {
    const frame = await FileResource.fetchById(auth, frameCandidate.sId);
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
        manifestMountPath,
        source,
        sourceMountPath,
      })
    ) {
      return conversionError(
        "conflict",
        "The legacy Frame is already being converted from another source path."
      );
    }
    const activePublicationId = frame.useCaseMetadata?.activePublicationId;
    if (frame.isFrameV2 && pending && activePublicationId) {
      try {
        await frame.finishFrameV2Conversion(auth);
      } catch (error) {
        logger.error(
          {
            error: normalizeError(error),
            frameId: frame.sId,
            manifestPath: manifest,
            sourcePath: source,
          },
          "Failed to finish an activated Frame conversion"
        );
        return conversionError(
          "internal",
          "Frame conversion was activated but not finalized; retry the conversion command."
        );
      }
      const result = {
        frameId: frame.sId,
        manifestPath: manifest,
        publicationId: activePublicationId,
      };
      emitFrameConvertedAuditEvent(auth, { ...result, sourcePath: source });
      return new Ok(result);
    }
    const originalContentType = frame.contentType;
    if (
      !pending &&
      (!isInteractiveContentType(originalContentType) ||
        frame.isFrameV2 ||
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

    const restore = async (transition: PendingConversion): Promise<boolean> => {
      try {
        await frame.updateFrameSourceBinding({
          contentType: transition.legacyContentType,
          fileName: transition.legacyFileName,
          fileSize: transition.legacyFileSize,
          mountFilePath: transition.legacyMountFilePath,
          useCase: transition.legacyUseCase,
          useCaseMetadata: transition.legacyUseCaseMetadata,
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

    const sourceSnapshot = await captureFrameV2SourceSnapshot(dustFs, manifest);
    if (sourceSnapshot.isErr()) {
      if (pending && !(await restore(pending))) {
        return conversionError(
          "internal",
          "Frame conversion recovery failed and its legacy source binding could not be restored."
        );
      }
      return sourceSnapshot;
    }
    if (sourceSnapshot.value.manifest.databases.length > 0) {
      const error = conversionError(
        "invalid_source",
        "Convert the legacy Frame before adding Frame-owned databases, then publish again."
      );
      if (pending && !(await restore(pending))) {
        return conversionError(
          "internal",
          "Frame conversion recovery failed and its legacy source binding could not be restored."
        );
      }
      return error;
    }

    if (!pending) {
      if (!isInteractiveContentType(originalContentType)) {
        return conversionError("conflict", "The legacy Frame changed.");
      }
      pending = {
        legacyContentType: originalContentType,
        legacyFileName: frame.fileName,
        legacyFileSize: frame.fileSize,
        legacyMountFilePath: sourceMountPath,
        legacyRenderableVersion: frame.useCaseMetadata?.frameBundleRootPath
          ? "processed"
          : "original",
        legacyUseCase: frame.useCase,
        legacyUseCaseMetadata: frame.useCaseMetadata ?? {},
        manifestMountFilePath: manifestMountPath,
        manifestPath: manifest,
        sourcePath: source,
      };
      try {
        await frame.updateFrameSourceBinding({
          contentType: frameV2ContentType,
          fileName: FRAME_MANIFEST_FILE,
          fileSize: sourceSnapshot.value.manifestSizeBytes,
          mountFilePath: manifestMountPath,
          useCase: targetOwner.useCase,
          useCaseMetadata: {
            ...getConvertedFrameMetadata(
              frame.useCaseMetadata ?? undefined,
              targetOwner
            ),
            pendingFrameV2Conversion: pending,
          },
        });
      } catch (error) {
        if (error instanceof UniqueConstraintError) {
          return conversionError(
            "conflict",
            "A registered file already uses the v2 manifest path."
          );
        }
        return conversionError(
          "internal",
          `Frame conversion failed: ${normalizeError(error).message}`
        );
      }
    }

    const transition = pending;
    if (!transition) {
      return conversionError("internal", "Frame conversion marker is missing.");
    }

    try {
      const publication = await publishFrameV2FromSourceWithLockHeld(auth, {
        conversation,
        frame,
        manifestPath: manifest,
        sourceSnapshot: sourceSnapshot.value,
      });
      if (publication.isErr()) {
        return (await restore(transition))
          ? new Err(publication.error)
          : conversionError(
              "internal",
              "Frame conversion failed and its legacy source binding could not be restored."
            );
      }

      await frame.finishFrameV2Conversion(auth);

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

      const result = {
        frameId: frame.sId,
        manifestPath: manifest,
        publicationId: publication.value.publicationId,
      };
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
      const restored = await restore(transition);
      return conversionError(
        "internal",
        restored
          ? `Frame conversion failed: ${normalizeError(error).message}`
          : "Frame conversion failed and its legacy source binding could not be restored."
      );
    }
  };
  let conversion: Result<
    ConvertLegacyFrameToV2Result,
    ConvertLegacyFrameToV2Error | LockAcquisitionTimeoutError
  >;
  try {
    conversion = await withLegacyFrameMutationLock(frameCandidate.sId, () =>
      withFrameSourceLock<
        ConvertLegacyFrameToV2Result,
        ConvertLegacyFrameToV2Error
      >(frameCandidate.sId, convertWithSourceLock)
    );
  } catch (error) {
    if (isLockAcquisitionTimeoutError(error)) {
      return conversionError(
        "conflict",
        "Another source operation is in progress for this Frame; retry shortly."
      );
    }
    return conversionError(
      "internal",
      `Frame conversion failed: ${normalizeError(error).message}`
    );
  }
  if (conversion.isErr()) {
    if (isLockAcquisitionTimeoutError(conversion.error)) {
      return conversionError(
        "conflict",
        "Another source operation is in progress for this Frame; retry shortly."
      );
    }
    return new Err(conversion.error);
  }
  return conversion;
}
