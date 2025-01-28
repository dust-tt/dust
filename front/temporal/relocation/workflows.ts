import type { ModelId } from "@dust-tt/types";
import {
  continueAsNew,
  executeChild,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";

import type { RegionType } from "@app/lib/api/regions/config";
import { RELOCATION_QUEUES_PER_REGION } from "@app/temporal/relocation/config";
import type * as destinationActivities from "@app/temporal/relocation/destination_region_activities";
import type * as sourceActivities from "@app/temporal/relocation/source_region_activities";

const CHUNK_SIZE = 5000;
const TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH = 10_000;

interface RelocationWorkflowBase {
  sourceRegion: RegionType;
  targetRegion: RegionType;
  workspaceId: ModelId;
}

const getSourceRegionActivities = (region: RegionType) => {
  return proxyActivities<typeof sourceActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_REGION[region],
  });
};

const getDestinationRegionActivities = (region: RegionType) => {
  return proxyActivities<typeof destinationActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_REGION[region],
  });
};

export async function workspaceRelocationWorkflow({
  sourceRegion,
  targetRegion,
  workspaceId,
}: RelocationWorkflowBase) {
  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  await executeChild(workspaceRelocateFrontWorkflow, {
    workflowId: `workspaceRelocateFrontWorkflow-${workspaceId}`,
    searchAttributes: parentSearchAttributes,
    args: [
      {
        sourceRegion,
        targetRegion,
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
  targetRegion,
  workspaceId,
}: RelocationWorkflowBase) {
  const sourceRegionActivities = getSourceRegionActivities(sourceRegion);

  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  // First, we move the workspace, users and plan in the destination region.
  const workspaceAndUsersDataPath =
    await sourceRegionActivities.readWorkspaceAndUsersFromSourceRegion({
      workspaceId,
    });

  await getDestinationRegionActivities(
    targetRegion
  ).writeWorkspaceAndUsersToDestinationRegion({
    dataPath: workspaceAndUsersDataPath,
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
          targetRegion,
          workspaceId,
        },
      ],
      memo,
    });
  }

  // 2) Relocate the associated files from the file storage to the destination region.
}

export async function workspaceRelocateFrontTableWorkflow({
  lastProcessedId,
  sourceRegion,
  tableName,
  targetRegion,
  workspaceId,
}: RelocationWorkflowBase & { tableName: string; lastProcessedId?: ModelId }) {
  // Create activity proxies with dynamic task queues.
  const sourceRegionActivities = proxyActivities<typeof sourceActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_REGION[sourceRegion],
  });

  const destinationRegionActivities = proxyActivities<
    typeof destinationActivities
  >({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_REGION[targetRegion],
  });

  let hasMoreRows = true;
  let currentId: ModelId | undefined = lastProcessedId;

  do {
    if (workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH) {
      await continueAsNew<typeof workspaceRelocateFrontTableWorkflow>({
        sourceRegion,
        targetRegion,
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
      });

    hasMoreRows = hasMore;
    currentId = lastId;

    await destinationRegionActivities.processFrontTableChunk({
      dataPath,
    });
  } while (hasMoreRows);
}

export async function workspaceRelocateFrontFileStorageWorkflow({
  sourceRegion,
  targetRegion,
  workspaceId,
}: RelocationWorkflowBase) {}
