import { getBucketInstance } from "@app/lib/file_storage";
import fileStorageConfig from "@app/lib/file_storage/config";
import { isGCSNotFoundError } from "@app/lib/file_storage/types";
import { getContentFragmentBaseCloudStorageForWorkspace } from "@app/lib/resources/content_fragment_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import config from "@app/temporal/relocation/activities/config";
import type {
  CreateDataSourceProjectResult,
  DataSourceCoreIds,
} from "@app/temporal/relocation/activities/types";
import { copyCoreTableFiles } from "@app/temporal/relocation/lib/file_storage/copy_core_tables";
import { StorageTransferService } from "@app/temporal/relocation/lib/file_storage/transfer";
import type { CellType } from "@app/types/cell";
import { getBaseMountPathForWorkspace } from "@app/types/mount_path";
import { isDevelopment } from "@app/types/shared/env";
import { Context } from "@temporalio/activity";

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
 * It represents an empty prefix or direct copies completed by the start activity.
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

/**
 * @cc [owner:flvndvd,label:performance] skip-empty-core-table-transfers
 * Return null only after every source object has been copied and verified, or
 * after a successful empty listing. Never create an STS job for table files.
 * Existing STS job names recorded in workflow history remain pollable.
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

  const startedAt = Date.now();
  const context = Context.current();
  const checkCanContinue = () => {
    context.cancellationSignal.throwIfAborted();
    // The existing activity has a ten-minute start-to-close timeout. Stop
    // starting new copies after eight minutes; retries skip verified objects.
    // A single large rewrite can still exceed the activity timeout.
    if (Date.now() - startedAt >= 8 * 60 * 1000) {
      throw new Error(
        "Table copy activity budget reached; retry remaining objects"
      );
    }
  };

  // Match relocation staging storage: use Workload Identity in production.
  const sourceStorage = getBucketInstance(sourceBucket, {
    useServiceAccount: isDevelopment(),
  });
  const { files, pageFetchCount } = await sourceStorage.getAllFilesByPrefix({
    prefix: sourcePath,
  });
  checkCanContinue();

  if (files.length === 0) {
    localLogger.info("[Storage Transfer] Skipping empty table files transfer.");
    return null;
  }

  const destinationStorage = getBucketInstance(destBucket, {
    useServiceAccount: isDevelopment(),
  });
  localLogger.info(
    { objectCount: files.length, pageFetchCount },
    "[GCS Copy] Starting direct table file copies."
  );
  const counts = await copyCoreTableFiles({
    files,
    sourcePrefix: sourcePath,
    destinationPrefix: makeCoreTableDestPath(destIds),
    copyFile: (sourceName, destinationName, sourceGeneration) =>
      sourceStorage.copyFile(sourceName, destinationName, destinationStorage, {
        sourceGeneration,
      }),
    getDestinationMetadata: async (name) => {
      try {
        const [metadata] = await destinationStorage.file(name).getMetadata();
        return metadata;
      } catch (error) {
        if (isGCSNotFoundError(error)) {
          return null;
        }
        // A 403 or other failure must never be interpreted as a missing object.
        throw error;
      }
    },
    checkCanContinue,
  });

  localLogger.info(
    { ...counts, objectCount: files.length, durationMs: Date.now() - startedAt },
    "[GCS Copy] Table file copies completed and verified."
  );
  // Preserve the existing workflow/activity contract and null completion path.
  // Unlike an STS job, the copies are already complete when this returns.
  return null;
}
