import { getBucketInstance } from "@app/lib/file_storage";
import config from "@app/temporal/relocation/activities/config";
import { isDevelopment } from "@app/types";

const RELOCATION_PATH_PREFIX = "relocations";

interface RelocationStorageOptions {
  workspaceId: string;
  type: "front" | "connectors" | "core";
  operation: string;
}

// In prod, we use pod annotations to set the service account.
export async function writeToRelocationStorage(
  data: unknown,
  { workspaceId, type, operation }: RelocationStorageOptions
): Promise<string> {
  const timestamp = Date.now();
  const path = `${RELOCATION_PATH_PREFIX}/${workspaceId}/${type}/${operation}/${timestamp}.json`;

  const relocationBucket = getBucketInstance(config.getGcsRelocationBucket(), {
    useServiceAccount: isDevelopment(),
  });

  await relocationBucket.uploadRawContentToBucket({
    content: JSON.stringify(data),
    contentType: "application/json",
    filePath: path,
  });

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
