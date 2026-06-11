import type * as activities from "@connectors/connectors/dust_project/temporal/activities";
import type { ModelId } from "@connectors/types";
import { proxyActivities } from "@temporalio/workflow";

const {
  dustProjectConversationsFullSyncActivity,
  dustProjectConversationsIncrementalSyncActivity,
  dustProjectMountFilesFullSyncActivity,
  dustProjectMountFilesIncrementalSyncActivity,
  dustProjectSyncMetadataActivity,
  dustProjectMarkSyncedActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minutes",
});

/**
 * Generate workflow IDs for dust_project workflows
 */
export function dustProjectFullSyncWorkflowId(connectorId: ModelId): string {
  return `dust-project-full-sync-${connectorId}`;
}

export function dustProjectIncrementalSyncWorkflowId(
  connectorId: ModelId
): string {
  return `dust-project-incremental-sync-${connectorId}`;
}

type DustProjectSyncActivity = (input: {
  connectorId: ModelId;
}) => Promise<{ skippedDueToWorkspaceApiAccess: boolean }>;

async function dustProjectSyncActivitiesCompleted(
  connectorId: ModelId,
  activities: ReadonlyArray<DustProjectSyncActivity>
): Promise<boolean> {
  for (const activity of activities) {
    if ((await activity({ connectorId })).skippedDueToWorkspaceApiAccess) {
      return false;
    }
  }
  return true;
}

/**
 * Full sync workflow for dust_project connector.
 * Syncs all conversations for a project from scratch.
 */
export async function dustProjectFullSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<void> {
  if (
    await dustProjectSyncActivitiesCompleted(connectorId, [
      dustProjectConversationsFullSyncActivity,
      dustProjectMountFilesFullSyncActivity,
      dustProjectSyncMetadataActivity,
    ])
  ) {
    await dustProjectMarkSyncedActivity({ connectorId });
  }
}

/**
 * Incremental sync workflow for dust_project connector.
 * Syncs only conversations that have been updated since the last sync.
 */
export async function dustProjectIncrementalSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<void> {
  if (
    await dustProjectSyncActivitiesCompleted(connectorId, [
      dustProjectConversationsIncrementalSyncActivity,
      dustProjectMountFilesIncrementalSyncActivity,
      dustProjectSyncMetadataActivity,
    ])
  ) {
    await dustProjectMarkSyncedActivity({ connectorId });
  }
}
