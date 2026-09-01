import path from "node:path";
import {
  GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
  getPrivateUploadBucket,
} from "@app/lib/file_storage";
import { isGCSPreconditionFailedError } from "@app/lib/file_storage/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";

const FRAME_SOURCE_COPY_CONCURRENCY = 4;
const MAX_FRAME_SOURCE_FILE_COUNT = 1024;
const MAX_FRAME_SOURCE_BYTES = 100 * 1024 * 1024;

export class FrameSourceStorageError extends Error {
  constructor(
    readonly code: "conflict" | "copy_failed" | "invalid_source",
    message: string
  ) {
    super(message);
    this.name = "FrameSourceStorageError";
  }
}

function storageError(code: FrameSourceStorageError["code"], message: string) {
  return new Err(new FrameSourceStorageError(code, message));
}

export type FrameSourceStorageSnapshot = {
  destinationMountPrefix: string;
  sourceMountPrefix: string;
  sourceObjectNames: string[];
  sourceObjects: Array<{ generation: string; name: string }>;
};

export async function inspectFrameSourceStorage({
  destinationMountPath,
  sourceMountPath,
}: {
  destinationMountPath: string;
  sourceMountPath: string;
}): Promise<Result<FrameSourceStorageSnapshot, FrameSourceStorageError>> {
  const bucket = getPrivateUploadBucket();
  const sourceMountPrefix = `${path.posix.dirname(sourceMountPath)}/`;
  const destinationMountDirectory = path.posix.dirname(destinationMountPath);
  const destinationMountPrefix = `${destinationMountDirectory}/`;

  try {
    const [[destinationFileExists], destinationObjects] = await Promise.all([
      bucket.file(destinationMountDirectory).exists(),
      bucket.getFiles({ prefix: destinationMountPrefix, maxResults: 1 }),
    ]);
    if (destinationFileExists || destinationObjects.length > 0) {
      return storageError(
        "conflict",
        "A file or folder already exists at the destination."
      );
    }
  } catch (error) {
    return storageError(
      "copy_failed",
      `Failed to inspect the Frame destination; the source remains authoritative: ${normalizeError(error).message}`
    );
  }

  let sourceObjects;
  try {
    sourceObjects = await bucket.getFiles({
      prefix: sourceMountPrefix,
      maxResults: MAX_FRAME_SOURCE_FILE_COUNT + 1,
    });
  } catch (error) {
    return storageError(
      "copy_failed",
      `Failed to inspect the Frame source; the source remains authoritative: ${normalizeError(error).message}`
    );
  }
  if (sourceObjects.length > MAX_FRAME_SOURCE_FILE_COUNT) {
    return storageError(
      "invalid_source",
      "Frame source exceeds the copy size or file count limit."
    );
  }

  let sourceSizeBytes = 0;
  const sourceSnapshot: Array<{ generation: string; name: string }> = [];
  for (const sourceObject of sourceObjects) {
    const sizeBytes = Number(sourceObject.metadata.size);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
      return storageError(
        "invalid_source",
        `Frame source object has invalid size metadata: ${sourceObject.name}`
      );
    }
    sourceSizeBytes += sizeBytes;
    const generation = sourceObject.metadata.generation;
    if (!isString(generation) || generation.length === 0) {
      return storageError(
        "invalid_source",
        `Frame source object has invalid generation metadata: ${sourceObject.name}`
      );
    }
    sourceSnapshot.push({ generation, name: sourceObject.name });
  }
  if (sourceSizeBytes > MAX_FRAME_SOURCE_BYTES) {
    return storageError(
      "invalid_source",
      "Frame source exceeds the copy size or file count limit."
    );
  }
  if (!sourceObjects.some((entry) => entry.name === sourceMountPath)) {
    return storageError(
      "invalid_source",
      "Frame manifest not found in source folder."
    );
  }

  return new Ok({
    destinationMountPrefix,
    sourceMountPrefix,
    sourceObjectNames: sourceSnapshot.map((entry) => entry.name),
    sourceObjects: sourceSnapshot,
  });
}

export async function copyFrameSourceStorage(
  snapshot: FrameSourceStorageSnapshot
): Promise<Result<void, FrameSourceStorageError>> {
  const bucket = getPrivateUploadBucket();
  const copyResults = await concurrentExecutor(
    snapshot.sourceObjects,
    async (sourceObject) => {
      if (!sourceObject.name.startsWith(snapshot.sourceMountPrefix)) {
        return new Err(
          new Error(`Invalid Frame source object path: ${sourceObject.name}`)
        );
      }
      const relativePath = sourceObject.name.slice(
        snapshot.sourceMountPrefix.length
      );
      try {
        await bucket.copyFile(
          sourceObject.name,
          `${snapshot.destinationMountPrefix}${relativePath}`,
          undefined,
          {
            destinationGenerationMatch:
              GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
            sourceGeneration: sourceObject.generation,
          }
        );
        return new Ok(undefined);
      } catch (error) {
        return new Err(normalizeError(error));
      }
    },
    { concurrency: FRAME_SOURCE_COPY_CONCURRENCY }
  );
  const copyFailure = copyResults.find((result) => result.isErr());
  if (copyFailure?.isErr()) {
    return isGCSPreconditionFailedError(copyFailure.error)
      ? storageError(
          "conflict",
          "A file or folder was created at the destination while the Frame source was being copied."
        )
      : storageError(
          "copy_failed",
          `Failed to copy the Frame source; the source remains authoritative and partial destination objects may remain: ${copyFailure.error.message}`
        );
  }
  return new Ok(undefined);
}

export async function deleteFrameSourceStorage(
  snapshot: FrameSourceStorageSnapshot
): Promise<Result<void, Error>> {
  const bucket = getPrivateUploadBucket();
  const deletionResults = await concurrentExecutor(
    snapshot.sourceObjects,
    async ({ generation, name }) => {
      try {
        await bucket.delete(name, {
          ignoreNotFound: true,
          ifGenerationMatch: generation,
        });
        return new Ok(undefined);
      } catch (error) {
        return new Err(normalizeError(error));
      }
    },
    { concurrency: FRAME_SOURCE_COPY_CONCURRENCY }
  );
  const deletionFailure = deletionResults.find((result) => result.isErr());

  try {
    const remainingSourceObjects = await bucket.getFiles({
      prefix: snapshot.sourceMountPrefix,
      maxResults: 1,
    });
    if (deletionFailure?.isErr()) {
      return deletionFailure;
    }
    return remainingSourceObjects.length > 0
      ? new Err(new Error("Concurrent source writes survived cleanup."))
      : new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
