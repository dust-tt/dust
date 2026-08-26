import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import {
  FRAME_MANIFEST_FILE,
  isSafeFrameRelativePath,
  parseFrameManifest,
} from "@app/types/api/frame_manifest";
import {
  getFramePublicationBasePath,
  getFramePublicationManifestPath,
  getFramePublicationSourceBasePath,
  getFramePublicationSourcePath,
} from "@app/types/api/frame_storage";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const MAX_FRAME_SOURCE_FILE_COUNT = 1000;
const MAX_FRAME_SOURCE_TOTAL_BYTES = 100 * 1024 * 1024;
const FRAMES_V2_FEATURE_FLAG =
  "frames_v2" as const satisfies WhitelistableFeature;

export type FramePublicationErrorCode =
  | "feature_disabled"
  | "invalid_frame"
  | "invalid_manifest"
  | "invalid_source"
  | "not_published"
  | "storage_error";

export class FramePublicationError extends Error {
  constructor(
    readonly code: FramePublicationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "FramePublicationError";
  }
}

export type ActiveFramePublication = {
  publicationId: string;
  manifest: FrameManifest;
  basePath: string;
  sourceBasePath: string;
};

async function validateFrameAccess(
  auth: Authenticator,
  frame: FileResource
): Promise<FramePublicationError | null> {
  const workspace = auth.getNonNullableWorkspace();
  if (frame.workspaceId !== workspace.id || !frame.isFrameV2) {
    return new FramePublicationError(
      "invalid_frame",
      "The FileResource is not a Frames v2 Frame in this workspace."
    );
  }
  let featureEnabled: boolean;
  try {
    featureEnabled = await hasFeatureFlag(auth, FRAMES_V2_FEATURE_FLAG);
  } catch (error) {
    return storageError(error);
  }
  if (!featureEnabled) {
    return new FramePublicationError(
      "feature_disabled",
      "Frames v2 is not enabled for this workspace."
    );
  }
  return null;
}

function validateSourcePrefix(
  workspaceId: string,
  sourcePrefix: string
): FramePublicationError | null {
  const workspacePrefix = `w/${workspaceId}/`;
  if (
    sourcePrefix.includes("\\") ||
    !sourcePrefix.endsWith("/") ||
    path.posix.normalize(sourcePrefix) !== sourcePrefix ||
    sourcePrefix === workspacePrefix ||
    !sourcePrefix.startsWith(workspacePrefix)
  ) {
    return new FramePublicationError(
      "invalid_source",
      "The Frame source prefix must be a normalized folder inside its workspace."
    );
  }
  return null;
}

function storageError(error: unknown): FramePublicationError {
  return new FramePublicationError(
    "storage_error",
    normalizeError(error).message
  );
}

function activePublication({
  workspaceId,
  frameId,
  publicationId,
  manifest,
}: {
  workspaceId: string;
  frameId: string;
  publicationId: string;
  manifest: FrameManifest;
}): ActiveFramePublication {
  const pathArgs = { workspaceId, frameId, publicationId };
  return {
    publicationId,
    manifest,
    basePath: getFramePublicationBasePath(pathArgs),
    sourceBasePath: getFramePublicationSourceBasePath(pathArgs),
  };
}

async function snapshotPublication({
  workspaceId,
  frameId,
  publicationId,
  sourcePrefix,
}: {
  workspaceId: string;
  frameId: string;
  publicationId: string;
  sourcePrefix: string;
}): Promise<Result<FrameManifest, FramePublicationError>> {
  const bucket = getPrivateUploadBucket();
  let files;
  try {
    files = await bucket.getFiles({
      prefix: sourcePrefix,
      maxResults: MAX_FRAME_SOURCE_FILE_COUNT + 1,
    });
  } catch (error) {
    return new Err(storageError(error));
  }
  if (files.length > MAX_FRAME_SOURCE_FILE_COUNT) {
    return new Err(
      new FramePublicationError(
        "invalid_source",
        `The Frame source folder has more than ${MAX_FRAME_SOURCE_FILE_COUNT} files.`
      )
    );
  }
  const sourceFiles = files.filter((file) => !file.name.endsWith("/"));
  if (sourceFiles.length === 0) {
    return new Err(
      new FramePublicationError(
        "invalid_source",
        "The Frame source folder is empty."
      )
    );
  }
  let totalBytes = 0;
  const relativePaths = new Set<string>();
  const sourceObjects: {
    sourcePath: string;
    destinationPath: string;
    generation: string;
  }[] = [];
  for (const sourceFile of sourceFiles) {
    const relativePath = sourceFile.name.slice(sourcePrefix.length);
    if (
      !sourceFile.name.startsWith(sourcePrefix) ||
      !isSafeFrameRelativePath(relativePath)
    ) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Invalid source object '${sourceFile.name}'.`
        )
      );
    }
    const generation = sourceFile.metadata.generation;
    if (generation === undefined) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Source object '${sourceFile.name}' has no GCS generation.`
        )
      );
    }
    const size = Number(sourceFile.metadata.size);
    if (!Number.isSafeInteger(size) || size < 0) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Source object '${sourceFile.name}' has no valid GCS size.`
        )
      );
    }
    totalBytes += size;
    if (totalBytes > MAX_FRAME_SOURCE_TOTAL_BYTES) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `The Frame source folder exceeds ${MAX_FRAME_SOURCE_TOTAL_BYTES} bytes.`
        )
      );
    }

    relativePaths.add(relativePath);
    sourceObjects.push({
      sourcePath: sourceFile.name,
      destinationPath: getFramePublicationSourcePath({
        workspaceId,
        frameId,
        publicationId,
        relativePath,
      }),
      generation: String(generation),
    });
  }
  if (!relativePaths.has(FRAME_MANIFEST_FILE)) {
    return new Err(
      new FramePublicationError(
        "invalid_manifest",
        `The Frame source folder has no ${FRAME_MANIFEST_FILE}.`
      )
    );
  }

  const copyErrors = await concurrentExecutor(
    sourceObjects,
    async (sourceObject) => {
      try {
        await bucket.copyFile(
          sourceObject.sourcePath,
          sourceObject.destinationPath,
          bucket,
          { sourceGeneration: sourceObject.generation }
        );
        return null;
      } catch (error) {
        return normalizeError(error);
      }
    },
    { concurrency: 8 }
  );
  const copyError = copyErrors.find((error) => error !== null);
  if (copyError) {
    return new Err(storageError(copyError));
  }

  let manifestContent;
  try {
    manifestContent = await bucket.fetchFileContent(
      getFramePublicationSourcePath({
        workspaceId,
        frameId,
        publicationId,
        relativePath: FRAME_MANIFEST_FILE,
      })
    );
  } catch (error) {
    return new Err(storageError(error));
  }
  const manifestResult = parseFrameManifest(
    Buffer.from(manifestContent, "utf-8")
  );
  if (manifestResult.isErr()) {
    return new Err(
      new FramePublicationError("invalid_manifest", manifestResult.error)
    );
  }
  if (!relativePaths.has(manifestResult.value.uiEntryPoint)) {
    return new Err(
      new FramePublicationError(
        "invalid_manifest",
        `UI entry point '${manifestResult.value.uiEntryPoint}' was not found in the source folder.`
      )
    );
  }

  try {
    await bucket.uploadRawContentToBucket({
      content: `${JSON.stringify(manifestResult.value, null, 2)}\n`,
      contentType: "application/json",
      filePath: getFramePublicationManifestPath({
        workspaceId,
        frameId,
        publicationId,
      }),
    });
  } catch (error) {
    return new Err(storageError(error));
  }
  return new Ok(manifestResult.value);
}

async function cleanupIncompletePublication({
  workspaceId,
  frameId,
  publicationId,
}: {
  workspaceId: string;
  frameId: string;
  publicationId: string;
}): Promise<void> {
  const publicationBasePath = getFramePublicationBasePath({
    workspaceId,
    frameId,
    publicationId,
  });
  try {
    await getPrivateUploadBucket().deleteByPrefix(publicationBasePath);
  } catch (error) {
    logger.error(
      {
        error: normalizeError(error),
        frameId,
        publicationId,
        publicationBasePath,
      },
      "Failed to clean up an incomplete Frame publication."
    );
  }
}

/** Snapshot exact GCS object generations, then activate the complete publication. */
export async function publishFrameFromGCS(
  auth: Authenticator,
  {
    frame,
    sourcePrefix,
  }: {
    frame: FileResource;
    sourcePrefix: string;
  }
): Promise<Result<ActiveFramePublication, FramePublicationError>> {
  const accessError = await validateFrameAccess(auth, frame);
  if (accessError) {
    return new Err(accessError);
  }

  const workspaceId = auth.getNonNullableWorkspace().sId;
  const sourceError = validateSourcePrefix(workspaceId, sourcePrefix);
  if (sourceError) {
    return new Err(sourceError);
  }

  const publicationArgs = {
    workspaceId,
    frameId: frame.sId,
    publicationId: randomUUID(),
  };
  const snapshotResult = await snapshotPublication({
    ...publicationArgs,
    sourcePrefix,
  });
  if (snapshotResult.isErr()) {
    await cleanupIncompletePublication(publicationArgs);
    return snapshotResult;
  }

  try {
    await frame.activateFramePublication(auth, publicationArgs.publicationId);
  } catch (error) {
    // Keep the complete publication: the database write may have committed before failing.
    return new Err(storageError(error));
  }
  return new Ok(
    activePublication({ ...publicationArgs, manifest: snapshotResult.value })
  );
}

export async function loadActiveFramePublication(
  auth: Authenticator,
  frame: FileResource
): Promise<Result<ActiveFramePublication, FramePublicationError>> {
  const accessError = await validateFrameAccess(auth, frame);
  if (accessError) {
    return new Err(accessError);
  }

  const publicationId = frame.getActiveFramePublicationId();
  if (!publicationId) {
    return new Err(
      new FramePublicationError(
        "not_published",
        "The Frame has no active publication."
      )
    );
  }

  const workspaceId = auth.getNonNullableWorkspace().sId;
  try {
    const manifestContent = await getPrivateUploadBucket().fetchFileContent(
      getFramePublicationManifestPath({
        workspaceId,
        frameId: frame.sId,
        publicationId,
      })
    );
    const manifestResult = parseFrameManifest(
      Buffer.from(manifestContent, "utf-8")
    );
    if (manifestResult.isErr()) {
      return new Err(
        new FramePublicationError("storage_error", manifestResult.error)
      );
    }
    return new Ok(
      activePublication({
        workspaceId,
        frameId: frame.sId,
        publicationId,
        manifest: manifestResult.value,
      })
    );
  } catch (error) {
    return new Err(storageError(error));
  }
}
