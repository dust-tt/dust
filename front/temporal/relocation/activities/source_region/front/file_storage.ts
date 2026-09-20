import { getBucketInstance } from "@app/lib/file_storage";
import fileStorageConfig from "@app/lib/file_storage/config";
import { getContentFragmentBaseCloudStorageForWorkspace } from "@app/lib/resources/content_fragment_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import config from "@app/temporal/relocation/activities/config";
import type {
  CreateDataSourceProjectResult,
  DataSourceCoreIds,
} from "@app/temporal/relocation/activities/types";
import {
  StorageTransferService,
  TRANSFER_OPERATION_PREFIX,
} from "@app/temporal/relocation/lib/file_storage/transfer";
import type { CellType } from "@app/types/cell";
import { getBaseMountPathForWorkspace } from "@app/types/mount_path";
import { isDevelopment } from "@app/types/shared/env";

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

/**
 * @cc [owner:flvndvd,label:backend] skipped-transfers-are-complete
 * A null job name MUST complete without contacting STS.
 */
/**
 * @cc [owner:flvndvd,label:backend] poll-original-transfer-operation
 * Operation IDs MUST poll that operation even after its job has been reused.
 * Legacy job IDs MUST remain supported for existing workflow histories.
 */
export async function isFileStorageTransferComplete({
  jobName,
}: {
  jobName: string | null;
}): Promise<boolean> {
  if (jobName === null) {
    return true;
  }

  const storageTransfer = new StorageTransferService();

  const result = jobName.startsWith(TRANSFER_OPERATION_PREFIX)
    ? await storageTransfer.isTransferOperationDone(jobName)
    : await storageTransfer.isTransferJobDone({
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

/**
 * @cc [owner:flvndvd,label:performance] skip-empty-core-table-transfers
 * Empty source prefixes MUST return null without creating an STS job.
 * Listing failures MUST fail the activity.
 */
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
}): Promise<string | null> {
  const sourceBucket = fileStorageConfig.getDustTablesBucket();
  const sourcePath = makeCoreTableDestPath(dataSourceCoreIds);

  const localLogger = logger.child({
    destBucket,
    destCell,
    path: sourcePath,
    sourceCell,
    workspaceId,
  });

  // Match relocation staging storage: use Workload Identity in production.
  const files = await getBucketInstance(sourceBucket, {
    useServiceAccount: isDevelopment(),
  }).getFiles({
    prefix: sourcePath,
    maxResults: 1,
  });

  if (files.length === 0) {
    localLogger.info("[Storage Transfer] Skipping empty table files transfer.");
    return null;
  }

  localLogger.info("[Storage Transfer] Initiating table files transfer.");

  const storageTransferService = new StorageTransferService();

  const transferResult = await storageTransferService.startPooledTransfer({
    destBucket,
    destPath: makeCoreTableDestPath(destIds),
    destCell,
    sourceBucket,
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
      "[Storage Transfer] Failed to start table files transfer."
    );

    throw transferResult.error;
  }

  localLogger.info(
    {
      operationName: transferResult.value,
    },
    "[Storage Transfer] Table files transfer started successfully."
  );

  return transferResult.value;
}
