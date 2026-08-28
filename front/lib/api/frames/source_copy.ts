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

export type DestinationObject = { filePath: string; generation: string };

type FrameSourceCopyFailure = {
  destinationObjects: DestinationObject[];
  error: FrameSourceCopyError;
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

export async function copyFrameSourceAsNew({
  allowMatchingDestinationObjects,
  destinationMountPrefix,
  sourceMountPrefix,
}: {
  allowMatchingDestinationObjects: boolean;
  destinationMountPrefix: string;
  sourceMountPrefix: string;
}): Promise<Result<DestinationObject[], FrameSourceCopyFailure>> {
  const bucket = getPrivateUploadBucket();
  let sourceFiles: File[];
  let destinationFiles: File[];
  try {
    [sourceFiles, destinationFiles] = await Promise.all([
      bucket.getFiles({
        prefix: sourceMountPrefix,
        maxResults: MAX_FRAME_SOURCE_FILE_COUNT + 1,
      }),
      bucket.getFiles({
        prefix: destinationMountPrefix,
        maxResults: MAX_FRAME_SOURCE_FILE_COUNT + 1,
      }),
    ]);
  } catch (error) {
    return new Err({
      destinationObjects: [],
      error: new FrameSourceCopyError(
        "internal",
        `Failed to list the Frame source: ${normalizeError(error).message}`
      ),
    });
  }
  if (sourceFiles.length === 0) {
    return new Err({
      destinationObjects: [],
      error: new FrameSourceCopyError(
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
      error: new FrameSourceCopyError(
        "invalid_source",
        "Frame source exceeds the copy size limit."
      ),
    });
  }
  if (destinationFiles.length > MAX_FRAME_SOURCE_FILE_COUNT) {
    return new Err({
      destinationObjects: [],
      error: new FrameSourceCopyError(
        "conflict",
        "Frame destination exceeds the copy file count limit."
      ),
    });
  }
  if (!allowMatchingDestinationObjects && destinationFiles.length > 0) {
    return new Err({
      destinationObjects: [],
      error: new FrameSourceCopyError(
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
      const relativePath = sourceFile.name.slice(sourceMountPrefix.length);
      const destinationPath = `${destinationMountPrefix}${relativePath}`;
      let destinationFile = destinationByRelativePath.get(relativePath);
      let copied = false;
      let copiedGeneration: string | null = null;

      if (!destinationFile) {
        try {
          copiedGeneration = await bucket.copyFile(
            sourceFile.name,
            destinationPath,
            undefined,
            {
              destinationGenerationMatch:
                GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
            }
          );
          copied = true;
        } catch (error) {
          if (!isGCSPreconditionFailedError(error)) {
            return new Err(
              new FrameSourceCopyError(
                "internal",
                `Failed to copy the Frame source: ${normalizeError(error).message}`
              )
            );
          }
        }
        if (!copied) {
          destinationFile = bucket.file(destinationPath);
          try {
            const [metadata] = await destinationFile.getMetadata();
            destinationFile.metadata = metadata;
          } catch (error) {
            return new Err(
              new FrameSourceCopyError(
                "internal",
                `Failed to read the copied Frame source: ${normalizeError(error).message}`
              )
            );
          }
        }
      }

      if (copied) {
        if (!copiedGeneration) {
          return new Err(
            new FrameSourceCopyError(
              "internal",
              `Destination generation is missing: ${relativePath}`
            )
          );
        }
        return new Ok<DestinationObject>({
          filePath: destinationPath,
          generation: copiedGeneration,
        });
      }
      if (!destinationFile) {
        return new Err(
          new FrameSourceCopyError(
            "internal",
            `Destination file is missing: ${relativePath}`
          )
        );
      }

      if (!allowMatchingDestinationObjects) {
        return new Err(
          new FrameSourceCopyError(
            "conflict",
            `Destination file already exists: ${relativePath}`
          )
        );
      }
      if (!isSameGCSObject(sourceFile, destinationFile)) {
        return new Err(
          new FrameSourceCopyError(
            "conflict",
            `Destination file already exists: ${relativePath}`
          )
        );
      }

      const generation = metadataValue(destinationFile.metadata, "generation");
      if (!generation) {
        return new Err(
          new FrameSourceCopyError(
            "internal",
            `Destination generation is missing: ${relativePath}`
          )
        );
      }
      return new Ok<DestinationObject>({
        filePath: destinationPath,
        generation,
      });
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
