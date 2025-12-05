import type { RegionType } from "@app/lib/api/regions/config";
import fileStorageConfig from "@app/lib/file_storage/config";
import { getContentFragmentBaseCloudStorageForWorkspace } from "@app/lib/resources/content_fragment_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import config from "@app/temporal/relocation/activities/config";
import type {
  CreateDataSourceProjectResult,
  DataSourceCoreIds,
} from "@app/temporal/relocation/activities/types";
import { StorageTransferService } from "@app/temporal/relocation/lib/file_storage/transfer";

export async function startTransferFrontPublicFiles({
  destBucket,
  destRegion,
  sourceRegion,
  workspaceId,
}: {
  destBucket: string;
  destRegion: RegionType;
  sourceRegion: RegionType;
  workspaceId: string;
}): Promise<string> {
  const storageTransferService = new StorageTransferService();

  const localLogger = logger.child({
    destBucket,
    destRegion,
    path: FileResource.getBaseCloudStorageForWorkspace({ workspaceId }),
    sourceRegion,
    workspaceId,
  });

  localLogger.info(
    "[Storage Transfer] Initiating front public files transfer."
  );

  const transferResult = await storageTransferService.createTransferJob({
    destBucket,
    destPath: FileResource.getBaseCloudStorageForWorkspace({
      workspaceId,
    }),
    destRegion,
    sourceBucket: fileStorageConfig.getGcsPublicUploadBucket(),
    sourcePath: FileResource.getBaseCloudStorageForWorkspace({
      workspaceId,
    }),
    sourceProjectId: config.getGcsSourceProjectId(),
    sourceRegion,
    workspaceId,
  });

  if (transferResult.isErr()) {
    localLogger.error(
      {
        error: transferResult.error,
      },
      "[Storage Transfer] Failed to create public files transfer job."
    );

    throw transferResult.error;
  }

  localLogger.info(
    {
      jobName: transferResult.value,
    },
    "[Storage Transfer] Public files transfer job created successfully."
  );

  return transferResult.value;
}

export async function startTransferFrontPrivateFiles({
  destBucket,
  destRegion,
  sourceRegion,
  workspaceId,
}: {
  destBucket: string;
  destRegion: RegionType;
  sourceRegion: RegionType;
  workspaceId: string;
}): Promise<string> {
  const storageTransferService = new StorageTransferService();

  const localLogger = logger.child({
    destBucket,
    destRegion,
    path: FileResource.getBaseCloudStorageForWorkspace({ workspaceId }),
    sourceRegion,
    workspaceId,
  });

  localLogger.info(
    "[Storage Transfer] Initiating front private files transfer."
  );

  // Tranfer both private files and content fragments in the same job.
  const transferResult = await storageTransferService.createTransferJob({
    destBucket,
    destRegion,
    includePrefixes: [
      FileResource.getBaseCloudStorageForWorkspace({ workspaceId }),
      getContentFragmentBaseCloudStorageForWorkspace(workspaceId),
    ],
    sourceBucket: fileStorageConfig.getGcsPrivateUploadsBucket(),
    sourceProjectId: config.getGcsSourceProjectId(),
    sourceRegion,
    workspaceId,
  });

  if (transferResult.isErr()) {
    localLogger.error(
      {
        error: transferResult.error,
      },
      "[Storage Transfer] Failed to create private files transfer job."
    );

    throw transferResult.error;
  }

  localLogger.info(
    {
      jobName: transferResult.value,
    },
    "[Storage Transfer] Private files transfer job created successfully."
  );

  return transferResult.value;
}

export async function isFileStorageTransferComplete({
  jobName,
}: {
  jobName: string;
}): Promise<boolean> {
  const storageTransfer = new StorageTransferService();

  const result = await storageTransfer.isTransferJobDone({
    jobName,
    sourceProjectId: config.getGcsSourceProjectId(),
  });

  if (result.isErr()) {
    throw result.error;
  }

  return result.value;
}

function makeCoreTableDestPath(
  dataSourceCoreIds: CreateDataSourceProjectResult | DataSourceCoreIds
): string {
  const { dustAPIProjectId, dustAPIDataSourceId } = dataSourceCoreIds;

  return `project-${dustAPIProjectId}/${dustAPIDataSourceId}/`;
}

export async function startTransferCoreTableFiles({
  dataSourceCoreIds,
  destBucket,
  destIds,
  destRegion,
  sourceRegion,
  workspaceId,
}: {
  dataSourceCoreIds: DataSourceCoreIds;
  destBucket: string;
  destIds: CreateDataSourceProjectResult;
  destRegion: RegionType;
  sourceRegion: RegionType;
  workspaceId: string;
}): Promise<string> {
  const storageTransferService = new StorageTransferService();

  const sourcePath = makeCoreTableDestPath(dataSourceCoreIds);

  const localLogger = logger.child({
    destBucket,
    destRegion,
    path: sourcePath,
    sourceRegion,
    workspaceId,
  });

  localLogger.info("[Storage Transfer] Initiating table files transfer.");

  const transferResult = await storageTransferService.createTransferJob({
    destBucket,
    destPath: makeCoreTableDestPath(destIds),
    destRegion,
    sourceBucket: fileStorageConfig.getDustTablesBucket(),
    sourcePath,
    sourceProjectId: config.getGcsSourceProjectId(),
    sourceRegion,
    workspaceId,
  });

  if (transferResult.isErr()) {
    localLogger.error(
      {
        error: transferResult.error,
      },
      "[Storage Transfer] Failed to create table files transfer job."
    );

    throw transferResult.error;
  }

  localLogger.info(
    {
      jobName: transferResult.value,
    },
    "[Storage Transfer] Table files transfer job created successfully."
  );

  return transferResult.value;
}
