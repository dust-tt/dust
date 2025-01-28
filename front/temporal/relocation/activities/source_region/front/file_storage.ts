import type { Result } from "@dust-tt/types";

import type { RegionType } from "@app/lib/api/regions/config";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import config from "@app/temporal/relocation/activities/config";
import { StorageTransferService } from "@app/temporal/relocation/lib/file_storage/transfer";

export async function startTransferFrontFilesToDestinationRegion({
  destRegion,
  sourceRegion,
  workspaceId,
}: {
  destRegion: RegionType;
  sourceRegion: RegionType;
  workspaceId: string;
}): Promise<Result<string, Error>> {
  const storageTransferService = new StorageTransferService();

  logger.info(
    {
      sourceRegion,
      destRegion,
      workspaceId,
    },
    "Starting transfer of front files"
  );

  const transferResult = await storageTransferService.createTransferJob({
    destBucket: "dust-public-uploads-test-europe",
    destPath: FileResource.getBaseCloudStorageForWorkspace({ workspaceId }),
    destRegion,
    sourceBucket: "dust-public-uploads-test",
    sourcePath: FileResource.getBaseCloudStorageForWorkspace({ workspaceId }),
    sourceProjectId: config.getGcsSourceProjectId(),
    sourceRegion,
    workspaceId,
  });

  return transferResult;
}

export async function isFileStorageTransferComplete({
  jobName,
}: {
  jobName: string;
}): Promise<Result<boolean, Error>> {
  const storageTransfer = new StorageTransferService();

  return storageTransfer.isTransferJobDone({
    jobName,
    sourceProjectId: config.getGcsSourceProjectId(),
  });
}
