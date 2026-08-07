import type * as activities from "@connectors/connectors/dust_project/temporal/activities";
import { dustProjectSyncSignal } from "@connectors/connectors/dust_project/temporal/signals";
import type { ModelId } from "@connectors/types";
import {
  allHandlersFinished,
  condition,
  continueAsNew,
  proxyActivities,
  setHandler,
  sleep,
} from "@temporalio/workflow";

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

/** Debounce window before running an on-demand incremental sync. */
const INCREMENTAL_SYNC_DEBOUNCE_MS = 30_000;
/** Cap debounce loops before continueAsNew to bound workflow history size. */
const MAX_DEBOUNCE_COUNT = 100;

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

export function dustProjectIncrementalSyncNowWorkflowId(
  connectorId: ModelId
): string {
  return `dust-project-incremental-sync-now-${connectorId}`;
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

async function runDustProjectIncrementalSync(
  connectorId: ModelId
): Promise<void> {
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
 * Cron-driven incremental sync for dust_project (hourly catch-up / GC).
 */
export async function dustProjectIncrementalSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<void> {
  await runDustProjectIncrementalSync(connectorId);
}

/**
 * On-demand incremental sync, coalesced via Temporal signals.
 * Front notifies on file/conversation changes; bursts debounce into one sync.
 */
export async function dustProjectIncrementalSyncNowWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<void> {
  let signaled = false;
  let debounceCount = 0;

  setHandler(dustProjectSyncSignal, () => {
    signaled = true;
  });

  while (signaled && debounceCount < MAX_DEBOUNCE_COUNT) {
    signaled = false;
    await sleep(INCREMENTAL_SYNC_DEBOUNCE_MS);
    if (signaled) {
      debounceCount++;
      continue;
    }

    await runDustProjectIncrementalSync(connectorId);
  }

  if (debounceCount >= MAX_DEBOUNCE_COUNT) {
    setHandler(dustProjectSyncSignal, undefined);
    await condition(allHandlersFinished);
    await continueAsNew({ connectorId });
  }

  // /!\ Any signal received outside of the while loop will be lost, so don't make any async
  // call here, which will allow the signal handler to be executed by the nodejs event loop. /!\
}
