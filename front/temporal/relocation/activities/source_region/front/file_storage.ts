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
import type { CellType } from "@app/types/cell";
import { getBaseMountPathForWorkspace } from "@app/types/mount_path";

export async function startTransferFrontPublicFiles({
  destBucket,
  destCell,
  sourceCell,
  workspaceId,
}: {
  destBucket: string;
  destCell: CellType;
  sourceCell: CellType;
  workspaceId: string;
}): Promise<string> {
  const storageTransferService = new StorageTransferService();

  const localLogger = logger.child({
    destBucket,
    destCell,
    path: FileResource.getBaseCloudStorageForWorkspace({ workspaceId }),
    sourceCell,
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
    destCell,
    sourceBucket: fileStorageConfig.getGcsPublicUploadBucket(),
    sourcePath: FileResource.getBaseCloudStorageForWorkspace({
      workspaceId,
    }),
    transferProjectId: config.getGcsTransferProjectId(),
    sourceCell,
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
  destCell,
  sourceCell,
  workspaceId,
}: {
  destBucket: string;
  destCell: CellType;
  sourceCell: CellType;
  workspaceId: string;
}): Promise<string> {
  const storageTransferService = new StorageTransferService();

  const localLogger = logger.child({
    destBucket,
    destCell,
    path: FileResource.getBaseCloudStorageForWorkspace({ workspaceId }),
    sourceCell,
    workspaceId,
  });

  localLogger.info(
    "[Storage Transfer] Initiating front private files transfer."
  );

  // Tranfer both private files and content fragments in the same job.
  const transferResult = await storageTransferService.createTransferJob({
    destBucket,
    destCell,
    includePrefixes: [
      FileResource.getBaseCloudStorageForWorkspace({ workspaceId }),
      getContentFragmentBaseCloudStorageForWorkspace(workspaceId),
      getBaseMountPathForWorkspace({ workspaceId }),
    ],
    sourceBucket: fileStorageConfig.getGcsPrivateUploadsBucket(),
    transferProjectId: config.getGcsTransferProjectId(),
    sourceCell,
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
    transferProjectId: config.getGcsTransferProjectId(),
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
  destCell,
  sourceCell,
  workspaceId,
}: {
  dataSourceCoreIds: DataSourceCoreIds;
  destBucket: string;
  destIds: CreateDataSourceProjectResult;
  destCell: CellType;
  sourceCell: CellType;
  workspaceId: string;
}): Promise<string> {
  const storageTransferService = new StorageTransferService();

  const sourcePath = makeCoreTableDestPath(dataSourceCoreIds);

  const localLogger = logger.child({
    destBucket,
    destCell,
    path: sourcePath,
    sourceCell,
    workspaceId,
  });

  localLogger.info("[Storage Transfer] Initiating table files transfer.");

  const transferResult = await storageTransferService.createTransferJob({
    destBucket,
    destPath: makeCoreTableDestPath(destIds),
    destCell,
    sourceBucket: fileStorageConfig.getDustTablesBucket(),
    sourcePath,
    transferProjectId: config.getGcsTransferProjectId(),
    sourceCell,
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
