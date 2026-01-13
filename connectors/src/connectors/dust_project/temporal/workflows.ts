import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/dust_project/temporal/activities";
import type { ModelId } from "@connectors/types";

const {
  dustProjectFullSyncActivity,
  dustProjectIncrementalSyncActivity,
  dustProjectGarbageCollectActivity,
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

export function dustProjectGarbageCollectWorkflowId(
  connectorId: ModelId
): string {
  return `dust-project-gc-${connectorId}`;
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
  await dustProjectFullSyncActivity({ connectorId });
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
  await dustProjectIncrementalSyncActivity({ connectorId });
}

/**
 * Garbage collection workflow for dust_project connector.
 * Removes conversations from the data source that no longer exist in the project.
 */
export async function dustProjectGarbageCollectWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<void> {
  await dustProjectGarbageCollectActivity({ connectorId });
}
