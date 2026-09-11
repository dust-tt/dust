import { getBucketInstance } from "@app/lib/file_storage";
import type { Logger } from "@app/logger/logger";
import logger from "@app/logger/logger";
import config from "@app/temporal/relocation/activities/config";
import {
  isJSONStringifyRangeError,
  isStringTooLongError,
} from "@app/temporal/relocation/activities/types";
import { isDevelopment } from "@app/types/shared/env";

const RELOCATION_PATH_PREFIX = "relocations";

// A staging reference names its bucket: the source stages in the bucket of its own
// location and the destination reads wherever the reference points, so a move inside
// the EU never crosses to the US bucket. Bare paths are read from the local bucket.
function parseRelocationStorageRef(ref: string): {
  bucket: string;
  path: string;
} {
  const match = ref.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (match) {
    return { bucket: match[1], path: match[2] };
  }
  return { bucket: config.getGcsRelocationBucket(), path: ref };
}

function getRelocationBucket(bucket: string) {
  return getBucketInstance(bucket, { useServiceAccount: isDevelopment() });
}

interface RelocationStorageOptions {
  workspaceId: string;
  type: "front" | "connectors" | "core";
  operation: string;
  /** Default to timestamps, can be overrided */
  fileName?: string;
}

export function getRelocationStoragePath({
  workspaceId,
  type,
  operation,
  fileName,
}: RelocationStorageOptions & { fileName: string }): string {
  return `${RELOCATION_PATH_PREFIX}/${workspaceId}/${type}/${operation}/${fileName}.json`;
}

// In prod, we use pod annotations to set the service account.
export async function writeToRelocationStorage(
  data: unknown,
  { workspaceId, type, operation, fileName }: RelocationStorageOptions
): Promise<string> {
  const path = getRelocationStoragePath({
    workspaceId,
    type,
    operation,
    fileName: fileName ?? Date.now().toString(),
  });

  const bucket = config.getGcsRelocationBucket();
  const relocationBucket = getRelocationBucket(bucket);

  try {
    await relocationBucket.uploadRawContentToBucket({
      content: JSON.stringify(data),
      contentType: "application/json",
      filePath: path,
    });
  } catch (err) {
    logger.info(
      {
        workspaceId,
        type,
        operation,
        fileName,
        error: err,
      },
      "[Relocation storage] Failed to write to relocation storage"
    );
    throw err;
  }

  return `gs://${bucket}/${path}`;
}

export async function readFromRelocationStorage<T = unknown>(
  dataPath: string
): Promise<T> {
  const { bucket, path } = parseRelocationStorageRef(dataPath);
  const relocationBucket = getRelocationBucket(bucket);

  const content = await relocationBucket.fetchFileContent(path);

  return JSON.parse(content) as T;
}

export async function deleteFromRelocationStorage(dataPath: string) {
  const { bucket, path } = parseRelocationStorageRef(dataPath);
  const relocationBucket = getRelocationBucket(bucket);

  await relocationBucket.delete(path, { ignoreNotFound: true });
}

export async function withJSONSerializationRetry<
  T extends { nextLimit: number | null },
>(
  operation: () => Promise<T>,
  options: {
    fallbackResult: Omit<T, "nextLimit">;
    limit: number;
    localLogger: Logger;
  }
): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    if (isStringTooLongError(err) || isJSONStringifyRangeError(err)) {
      const { fallbackResult, limit, localLogger } = options;
      const nextLimit: number | null = Math.floor(limit / 2);
      if (nextLimit === 0) {
        localLogger.error(
          { error: err, fallbackResult },
          "[Relocation storage] Failed to serialize data, string too long."
        );
        throw err;
      } else {
        const r = {
          ...fallbackResult,
          nextLimit,
        };
        logger.error(
          { limit, result: r },
          "[Relocation storage] Failed to serialize data, string too long - retrying with smaller limit."
        );
        // Keep the same page cursor, but try to reduce the limit.
        return r as T;
      }
    }
    throw err;
  }
}
