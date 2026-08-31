import {
  MAX_FRAME_SOURCE_BYTES,
  MAX_FRAME_SOURCE_FILE_COUNT,
} from "@app/lib/api/frames/source_limits";
import {
  GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
  getPrivateUploadBucket,
} from "@app/lib/file_storage";
import { isGCSPreconditionFailedError } from "@app/lib/file_storage/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { File, FileMetadata } from "@google-cloud/storage";

const FRAME_SOURCE_COPY_CONCURRENCY = 4;

export type FrameSourceCopyErrorCode =
  | "conflict"
  | "internal"
  | "invalid_source";

export class FrameSourceCopyError extends Error {
  constructor(
    readonly code: FrameSourceCopyErrorCode,
    message: string
  ) {
    super(message);
    this.name = "FrameSourceCopyError";
  }
}

export type GCSObjectGeneration = {
  filePath: string;
  generation: string;
};

export type FrameSourceCopy = {
  destinationObjects: GCSObjectGeneration[];
  hasPreexistingDestinationObjects: boolean;
  sourceObjects: GCSObjectGeneration[];
};

type FrameSourceCopyFailure = {
  destinationObjects: GCSObjectGeneration[];
  error: FrameSourceCopyError;
  hasPreexistingDestinationObjects: boolean;
};

function metadataValue(metadata: FileMetadata, key: keyof FileMetadata) {
  const value = metadata[key];
  return value === undefined || value === null ? null : String(value);
}

function isSameGCSObject(source: File, destination: File): boolean {
  const sourceMd5 = metadataValue(source.metadata, "md5Hash");
  const destinationMd5 = metadataValue(destination.metadata, "md5Hash");
  if (sourceMd5 && destinationMd5) {
    return sourceMd5 === destinationMd5;
  }

  const sourceCrc32c = metadataValue(source.metadata, "crc32c");
  const destinationCrc32c = metadataValue(destination.metadata, "crc32c");
  return Boolean(
    sourceCrc32c &&
      destinationCrc32c &&
      sourceCrc32c === destinationCrc32c &&
      metadataValue(source.metadata, "size") ===
        metadataValue(destination.metadata, "size")
  );
}

export async function cleanupFrameSourceCopy(
  objects: GCSObjectGeneration[],
  { operation }: { operation: "clone" | "move" }
): Promise<boolean> {
  const bucket = getPrivateUploadBucket();
  try {
    await concurrentExecutor(
      objects,
      ({ filePath, generation }) =>
        bucket.delete(filePath, {
          ignoreNotFound: true,
          ifGenerationMatch: generation,
        }),
      { concurrency: FRAME_SOURCE_COPY_CONCURRENCY }
    );
    return true;
  } catch (error) {
    logger.error(
      { error: normalizeError(error), operation },
      "Failed to clean up a Frame source copy destination"
    );
    return false;
  }
}

export async function copyFrameSourceAsNew({
  allowMatchingDestinationObjects,
  destinationMountPrefix,
  sourceManifestPath,
  sourceMountPrefix,
}: {
  allowMatchingDestinationObjects: boolean;
  destinationMountPrefix: string;
  sourceManifestPath: string;
  sourceMountPrefix: string;
}): Promise<Result<FrameSourceCopy, FrameSourceCopyFailure>> {
  const bucket = getPrivateUploadBucket();
  const [sourceFiles, destinationFiles] = await Promise.all([
    bucket.getFiles({
      prefix: sourceMountPrefix,
      maxResults: MAX_FRAME_SOURCE_FILE_COUNT + 1,
    }),
    bucket.getFiles({
      prefix: destinationMountPrefix,
      maxResults: MAX_FRAME_SOURCE_FILE_COUNT + 1,
    }),
  ]);
  if (sourceFiles.length === 0) {
    return new Err({
      destinationObjects: [],
      error: new FrameSourceCopyError(
        "invalid_source",
        "Frame source folder is empty or no longer exists."
      ),
      hasPreexistingDestinationObjects: destinationFiles.length > 0,
    });
  }
  if (!sourceFiles.some((file) => file.name === sourceManifestPath)) {
    return new Err({
      destinationObjects: [],
      error: new FrameSourceCopyError(
        "invalid_source",
        "Frame source manifest is missing."
      ),
      hasPreexistingDestinationObjects: destinationFiles.length > 0,
    });
  }
  const totalSourceSize = sourceFiles.reduce(
    (total, file) => total + Number(file.metadata.size ?? 0),
    0
  );
  if (
    sourceFiles.length > MAX_FRAME_SOURCE_FILE_COUNT ||
    totalSourceSize > MAX_FRAME_SOURCE_BYTES
  ) {
    return new Err({
      destinationObjects: [],
      error: new FrameSourceCopyError(
        "invalid_source",
        "Frame source exceeds the copy size limit."
      ),
      hasPreexistingDestinationObjects: destinationFiles.length > 0,
    });
  }
  if (destinationFiles.length > MAX_FRAME_SOURCE_FILE_COUNT) {
    return new Err({
      destinationObjects: [],
      error: new FrameSourceCopyError(
        "conflict",
        "Frame destination exceeds the copy file count limit."
      ),
      hasPreexistingDestinationObjects: true,
    });
  }

  const sourceRelativePaths = new Set(
    sourceFiles.map((file) => file.name.slice(sourceMountPrefix.length))
  );
  const unexpectedDestination = destinationFiles.find(
    (file) =>
      !sourceRelativePaths.has(file.name.slice(destinationMountPrefix.length))
  );
  if (unexpectedDestination) {
    return new Err({
      destinationObjects: [],
      error: new FrameSourceCopyError(
        "conflict",
        `Destination file already exists: ${unexpectedDestination.name.slice(destinationMountPrefix.length)}`
      ),
      hasPreexistingDestinationObjects: true,
    });
  }

  const destinationByRelativePath = new Map(
    destinationFiles.map((file) => [
      file.name.slice(destinationMountPrefix.length),
      file,
    ])
  );
  const copyResults = await concurrentExecutor(
    sourceFiles,
    async (sourceFile) => {
      let hasPreexistingDestinationObject = false;
      try {
        const relativePath = sourceFile.name.slice(sourceMountPrefix.length);
        const destinationPath = `${destinationMountPrefix}${relativePath}`;
        const sourceGeneration = metadataValue(
          sourceFile.metadata,
          "generation"
        );
        if (!sourceGeneration) {
          throw new FrameSourceCopyError(
            "internal",
            `Source generation is missing: ${relativePath}`
          );
        }
        let destinationFile = destinationByRelativePath.get(relativePath);
        let ownedDestinationObject: GCSObjectGeneration | null = null;
        hasPreexistingDestinationObject = Boolean(destinationFile);

        if (!destinationFile) {
          try {
            const copied = await bucket.copyFile(
              sourceFile.name,
              destinationPath,
              undefined,
              {
                destinationGenerationMatch:
                  GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
                sourceGeneration,
              }
            );
            destinationFile = copied.destinationFile;
            ownedDestinationObject = {
              filePath: destinationPath,
              generation: copied.destinationGeneration,
            };
          } catch (error) {
            if (!isGCSPreconditionFailedError(error)) {
              throw error;
            }
            if (!allowMatchingDestinationObjects) {
              throw new FrameSourceCopyError(
                "conflict",
                `Destination file already exists: ${relativePath}`
              );
            }
            hasPreexistingDestinationObject = true;
            destinationFile = bucket.file(destinationPath);
            const [metadata] = await destinationFile.getMetadata();
            destinationFile.metadata = metadata;
          }
        }

        if (
          !ownedDestinationObject &&
          (!allowMatchingDestinationObjects ||
            !isSameGCSObject(sourceFile, destinationFile))
        ) {
          throw new FrameSourceCopyError(
            "conflict",
            `Destination file already exists: ${relativePath}`
          );
        }

        return new Ok<{
          destination: GCSObjectGeneration | null;
          hasPreexistingDestinationObject: boolean;
          source: GCSObjectGeneration;
        }>({
          destination: ownedDestinationObject,
          hasPreexistingDestinationObject,
          source: {
            filePath: sourceFile.name,
            generation: sourceGeneration,
          },
        });
      } catch (error) {
        return new Err({
          error:
            error instanceof FrameSourceCopyError
              ? error
              : new FrameSourceCopyError(
                  "internal",
                  `Failed to copy the Frame source: ${normalizeError(error).message}`
                ),
          hasPreexistingDestinationObject,
        });
      }
    },
    { concurrency: FRAME_SOURCE_COPY_CONCURRENCY }
  );
  const copiedObjects = copyResults
    .filter((result) => result.isOk())
    .map((result) => result.value);
  const destinationObjects = copiedObjects.flatMap(({ destination }) =>
    destination ? [destination] : []
  );
  const hasPreexistingDestinationObjects =
    destinationFiles.length > 0 ||
    copyResults.some((result) =>
      result.isOk()
        ? result.value.hasPreexistingDestinationObject
        : result.error.hasPreexistingDestinationObject
    );
  const failedCopy = copyResults.find((result) => result.isErr());
  if (failedCopy?.isErr()) {
    return new Err({
      destinationObjects,
      error: failedCopy.error.error,
      hasPreexistingDestinationObjects,
    });
  }
  return new Ok({
    destinationObjects,
    hasPreexistingDestinationObjects,
    sourceObjects: copiedObjects.map(({ source }) => source),
  });
}
