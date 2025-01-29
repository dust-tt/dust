import type { ModelId } from "@dust-tt/types";
import {
  continueAsNew,
  executeChild,
  proxyActivities,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

import type { RegionType } from "@app/lib/api/regions/config";
import type * as frontDestinationActivities from "@app/temporal/relocation/activities/destination_region/front";
import type * as frontSourceActivities from "@app/temporal/relocation/activities/source_region/front";
import { RELOCATION_QUEUES_PER_REGION } from "@app/temporal/relocation/config";

const CHUNK_SIZE = 5000;
const TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH = 10_000;

interface RelocationWorkflowBase {
  sourceRegion: RegionType;
  destRegion: RegionType;
  workspaceId: string;
}

const getFrontSourceRegionActivities = (region: RegionType) => {
  return proxyActivities<typeof frontSourceActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_REGION[region],
  });
};

const getFrontDestinationRegionActivities = (region: RegionType) => {
  return proxyActivities<typeof frontDestinationActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_REGION[region],
  });
};

export async function workspaceRelocationWorkflow({
  sourceRegion,
  destRegion,
  workspaceId,
}: RelocationWorkflowBase) {
  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  await executeChild(workspaceRelocateFrontWorkflow, {
    workflowId: `workspaceRelocateFrontWorkflow-${workspaceId}`,
    searchAttributes: parentSearchAttributes,
    args: [
      {
        sourceRegion,
        destRegion,
        workspaceId,
      },
    ],
    memo,
  });
}

/**
 * Front relocation workflows.
 */

export async function workspaceRelocateFrontWorkflow({
  sourceRegion,
  destRegion,
  workspaceId,
}: RelocationWorkflowBase) {
  const sourceRegionActivities = getFrontSourceRegionActivities(sourceRegion);
  const destinationRegionActivities =
    getFrontDestinationRegionActivities(destRegion);

  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  // First, we move the workspace, users and plan in the destination region.
  const coreEntitiesDataPath =
    await sourceRegionActivities.readCoreEntitiesFromSourceRegion({
      destRegion,
      sourceRegion,
      workspaceId,
    });

  await destinationRegionActivities.writeCoreEntitiesToDestinationRegion({
    dataPath: coreEntitiesDataPath,
    destRegion,
    sourceRegion,
    workspaceId,
  });

  const tablesOrder =
    await sourceRegionActivities.getTablesWithWorkspaceIdOrder();

  // TODO: Also move other tables that don't have `workspaceId` but are related to the workspace.

  // 1) Relocate front tables to the destination region.
  for (const tableName of tablesOrder) {
    await executeChild(workspaceRelocateFrontTableWorkflow, {
      workflowId: `workspaceRelocateFrontTableWorkflow-${workspaceId}-${tableName}`,
      searchAttributes: parentSearchAttributes,
      args: [
        {
          sourceRegion,
          tableName,
          destRegion,
          workspaceId,
        },
      ],
      memo,
    });
  }

  // 2) Relocate the associated files from the file storage to the destination region.
  await executeChild(workspaceRelocateFrontFileStorageWorkflow, {
    workflowId: `workspaceRelocateFrontFileStorageWorkflow-${workspaceId}`,
    searchAttributes: parentSearchAttributes,
    args: [
      {
        sourceRegion,
        destRegion,
        workspaceId,
      },
    ],
  });
}

export async function workspaceRelocateFrontTableWorkflow({
  lastProcessedId,
  sourceRegion,
  tableName,
  destRegion,
  workspaceId,
}: RelocationWorkflowBase & {
  tableName: string;
  lastProcessedId?: ModelId;
}) {
  // Create activity proxies with dynamic task queues.
  const sourceRegionActivities = getFrontSourceRegionActivities(sourceRegion);
  const destinationRegionActivities =
    getFrontDestinationRegionActivities(destRegion);

  let hasMoreRows = true;
  let currentId: ModelId | undefined = lastProcessedId;

  do {
    if (workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH) {
      await continueAsNew<typeof workspaceRelocateFrontTableWorkflow>({
        sourceRegion,
        destRegion,
        workspaceId,
        tableName,
        lastProcessedId: currentId,
      });
    }

    const { dataPath, hasMore, lastId } =
      await sourceRegionActivities.readFrontTableChunk({
        lastId: currentId,
        limit: CHUNK_SIZE,
        workspaceId,
        tableName,
        sourceRegion,
        destRegion,
      });

    hasMoreRows = hasMore;
    currentId = lastId;

    await destinationRegionActivities.processFrontTableChunk({
      dataPath,
      destRegion,
      sourceRegion,
      tableName,
      workspaceId,
    });
  } while (hasMoreRows);
}

export async function workspaceRelocateFrontFileStorageWorkflow({
  sourceRegion,
  destRegion,
  workspaceId,
}: RelocationWorkflowBase) {
  const sourceRegionActivities = getFrontSourceRegionActivities(sourceRegion);
  const destinationRegionActivities =
    getFrontDestinationRegionActivities(destRegion);

  // 1) Relocate public files.
  const destPublicBucket =
    await destinationRegionActivities.getDestinationPublicBucket();

  const publicFilesJobName =
    await sourceRegionActivities.startTransferFrontPublicFiles({
      destBucket: destPublicBucket,
      destRegion,
      sourceRegion,
      workspaceId,
    });

  // Wait for the file storage transfer to complete.
  let isPublicFilesTransferComplete = false;
  while (!isPublicFilesTransferComplete) {
    isPublicFilesTransferComplete =
      await sourceRegionActivities.isFileStorageTransferComplete({
        jobName: publicFilesJobName,
      });

    if (!isPublicFilesTransferComplete) {
      // Sleep for 1 minute before checking again.
      await sleep("1m");
    }
  }

  // 2) Relocate private files.
  const destPrivateBucket =
    await destinationRegionActivities.getDestinationPrivateBucket();

  const privateFilesJobName =
    await sourceRegionActivities.startTransferFrontPrivateFiles({
      destBucket: destPrivateBucket,
      destRegion,
      sourceRegion,
      workspaceId,
    });

  // Wait for the file storage transfer to complete.
  let isPrivateFilesTransferComplete = false;
  while (!isPrivateFilesTransferComplete) {
    isPrivateFilesTransferComplete =
      await sourceRegionActivities.isFileStorageTransferComplete({
        jobName: privateFilesJobName,
      });

    if (!isPrivateFilesTransferComplete) {
      // Sleep for 1 minute before checking again.
      await sleep("1m");
    }
  }
}
