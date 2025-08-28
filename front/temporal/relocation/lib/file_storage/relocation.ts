import { getBucketInstance } from "@app/lib/file_storage";
import type { Logger } from "@app/logger/logger";
import logger from "@app/logger/logger";
import config from "@app/temporal/relocation/activities/config";
import {
  isJSONStringifyRangeError,
  isStringTooLongError,
} from "@app/temporal/relocation/activities/types";
import { isDevelopment } from "@app/types";

const RELOCATION_PATH_PREFIX = "relocations";

interface RelocationStorageOptions {
  workspaceId: string;
  type: "front" | "connectors" | "core";
  operation: string;
  /** Default to timestamps, can be overrided */
  fileName?: string;
}

// In prod, we use pod annotations to set the service account.
export async function writeToRelocationStorage(
  data: unknown,
  { workspaceId, type, operation, fileName }: RelocationStorageOptions
): Promise<string> {
  const timestamp = Date.now();
  // default to timestamp if custom fileName if not provided
  const path = `${RELOCATION_PATH_PREFIX}/${workspaceId}/${type}/${operation}/${fileName ?? timestamp}.json`;

  const relocationBucket = getBucketInstance(config.getGcsRelocationBucket(), {
    useServiceAccount: isDevelopment(),
  });

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

  return path;
}

export async function readFromRelocationStorage<T = unknown>(
  dataPath: string
): Promise<T> {
  const relocationBucket = getBucketInstance(config.getGcsRelocationBucket(), {
    useServiceAccount: isDevelopment(),
  });

  const content = await relocationBucket.fetchFileContent(dataPath);

  return JSON.parse(content) as T;
}

export async function deleteFromRelocationStorage(dataPath: string) {
  const relocationBucket = getBucketInstance(config.getGcsRelocationBucket(), {
    useServiceAccount: isDevelopment(),
  });

  await relocationBucket.delete(dataPath, { ignoreNotFound: true });
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
