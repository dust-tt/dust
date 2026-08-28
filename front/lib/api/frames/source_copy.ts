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

function isFrameSourceCopyError(
  error: unknown
): error is Error & { code: FrameSourceCopyErrorCode } {
  return (
    error instanceof Error &&
    "code" in error &&
    ["conflict", "internal", "invalid_source"].includes(String(error.code))
  );
}

export type DestinationObject = { filePath: string; generation: string };

type FrameSourceCopyFailure<E extends Error> = {
  destinationObjects: DestinationObject[];
  error: E;
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
  objects: DestinationObject[],
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

export async function copyFrameSourceAsNew<E extends Error>({
  allowMatchingDestinationObjects,
  destinationMountPrefix,
  makeError,
  sourceMountPrefix,
}: {
  allowMatchingDestinationObjects: boolean;
  destinationMountPrefix: string;
  makeError: (code: FrameSourceCopyErrorCode, message: string) => E;
  sourceMountPrefix: string;
}): Promise<Result<DestinationObject[], FrameSourceCopyFailure<E>>> {
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
      error: makeError(
        "invalid_source",
        "Frame source folder is empty or no longer exists."
      ),
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
      error: makeError(
        "invalid_source",
        "Frame source exceeds the copy size limit."
      ),
    });
  }
  if (destinationFiles.length > MAX_FRAME_SOURCE_FILE_COUNT) {
    return new Err({
      destinationObjects: [],
      error: makeError(
        "conflict",
        "Frame destination exceeds the copy file count limit."
      ),
    });
  }
  if (!allowMatchingDestinationObjects && destinationFiles.length > 0) {
    return new Err({
      destinationObjects: [],
      error: makeError(
        "conflict",
        "A file or folder already exists at the destination."
      ),
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
      try {
        const relativePath = sourceFile.name.slice(sourceMountPrefix.length);
        const destinationPath = `${destinationMountPrefix}${relativePath}`;
        let destinationFile = destinationByRelativePath.get(relativePath);
        let copied = false;

        if (!destinationFile) {
          try {
            await bucket.copyFile(sourceFile.name, destinationPath, undefined, {
              destinationGenerationMatch:
                GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
            });
            copied = true;
          } catch (error) {
            if (!isGCSPreconditionFailedError(error)) {
              throw error;
            }
          }
          destinationFile = bucket.file(destinationPath);
          const [metadata] = await destinationFile.getMetadata();
          destinationFile.metadata = metadata;
        }

        if (!copied && !allowMatchingDestinationObjects) {
          throw makeError(
            "conflict",
            `Destination file already exists: ${relativePath}`
          );
        }
        if (!copied && !isSameGCSObject(sourceFile, destinationFile)) {
          throw makeError(
            "conflict",
            `Destination file already exists: ${relativePath}`
          );
        }

        const generation = metadataValue(
          destinationFile.metadata,
          "generation"
        );
        if (!generation) {
          throw makeError(
            "internal",
            `Destination generation is missing: ${relativePath}`
          );
        }
        return new Ok<DestinationObject>({
          filePath: destinationPath,
          generation,
        });
      } catch (error) {
        return new Err(
          isFrameSourceCopyError(error)
            ? (error as unknown as E)
            : makeError(
                "internal",
                `Failed to copy the Frame source: ${normalizeError(error).message}`
              )
        );
      }
    },
    { concurrency: FRAME_SOURCE_COPY_CONCURRENCY }
  );
  const destinationObjects = copyResults
    .filter((result) => result.isOk())
    .map((result) => result.value);
  const failedCopy = copyResults.find((result) => result.isErr());
  if (failedCopy?.isErr()) {
    return new Err({
      destinationObjects,
      error: failedCopy.error,
    });
  }
  return new Ok(destinationObjects);
}
