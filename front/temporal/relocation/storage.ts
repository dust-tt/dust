import type { ModelId } from "@dust-tt/types";
import { EnvironmentConfig } from "@dust-tt/types";

import { getBucketInstance } from "@app/lib/file_storage";

const RELOCATION_PATH_PREFIX = "relocation";

interface RelocationStorageOptions {
  workspaceId: ModelId;
  type: "front" | "connectors" | "core";
  operation: string;
}

const config = {
  getGcsRelocationBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_RELOCATION_BUCKET");
  },
};

export async function writeToRelocationStorage(
  data: unknown,
  { workspaceId, type, operation }: RelocationStorageOptions
): Promise<string> {
  const timestamp = Date.now();
  const path = `${RELOCATION_PATH_PREFIX}/${workspaceId}/${type}/${operation}/${timestamp}.json`;

  const relocationBucket = getBucketInstance(config.getGcsRelocationBucket());

  await relocationBucket.uploadRawContentToBucket({
    content: JSON.stringify(data),
    contentType: "application/json",
    filePath: path,
  });

  console.log("Writing data to path:", path);

  return path;
}

export async function readFromRelocationStorage<T = unknown>(
  dataPath: string
): Promise<T> {
  const relocationBucket = getBucketInstance(config.getGcsRelocationBucket());

  const content = await relocationBucket.fetchFileContent(dataPath);

  return JSON.parse(content) as T;
}
