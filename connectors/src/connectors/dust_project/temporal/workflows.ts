import type * as activities from "@connectors/connectors/dust_project/temporal/activities";
import type { ModelId } from "@connectors/types";
import { proxyActivities } from "@temporalio/workflow";

const {
  dustProjectConversationsFullSyncActivity,
  dustProjectConversationsIncrementalSyncActivity,
  dustProjectSyncMetadataActivity,
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

/**
 * Full sync workflow for dust_project connector.
 * Syncs all conversations for a project from scratch.
 */
export async function dustProjectFullSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<void> {
  await dustProjectConversationsFullSyncActivity({ connectorId });
  await dustProjectSyncMetadataActivity({ connectorId });
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
  await dustProjectConversationsIncrementalSyncActivity({ connectorId });
  await dustProjectSyncMetadataActivity({ connectorId });
}
