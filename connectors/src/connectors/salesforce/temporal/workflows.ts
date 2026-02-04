import type * as activities from "@connectors/connectors/salesforce/temporal/activities";
import { resyncSignal } from "@connectors/connectors/salesforce/temporal/signals";
import type * as sync_status from "@connectors/lib/sync_status";
import type { ModelId } from "@connectors/types";
import {
  executeChild,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";

const {
  upsertSyncedQueryRootNode,
  updateSyncedQueryLastSeenModifiedDate,
  discoverSalesforceSyncedQueries,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

const { processSyncedQueryPage } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minute",
});

const { syncSucceeded, syncStarted } = proxyActivities<typeof sync_status>({
  startToCloseTimeout: "10 minutes",
});

export function makeSalesforceSyncWorkflowId(connectorId: ModelId): string {
  return `salesforce-sync-${connectorId}`;
}

export async function salesforceSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  let signaled = false;

  setHandler(resyncSignal, () => {
    signaled = true;
  });

  do {
    signaled = false;
    await syncStarted(connectorId);

    // Synced queries
    const queries = await discoverSalesforceSyncedQueries(connectorId);
    for (const q of queries) {
      await executeChild(salesforceSyncQueryWorkflow, {
        workflowId: makeSalesforceSyncQueryWorkflowId(
          connectorId,
          q.id,
          q.lastSeenModifiedDateTs
        ),
        searchAttributes: {
          connectorId: [connectorId],
        },
        args: [
          {
            connectorId,
            queryId: q.id,
            upToLastModifiedDateTs: q.lastSeenModifiedDateTs,
          },
        ],
        memo: workflowInfo().memo,
      });
    }

    await syncSucceeded(connectorId);
  } while (signaled);
}

const SALESFORCE_SYNC_QUERY_PAGE_LIMIT = 256;

export function makeSalesforceSyncQueryWorkflowId(
  connectorId: ModelId,
  queryId: ModelId,
  upToLastModifiedDateTs: number | null
): string {
  if (upToLastModifiedDateTs) {
    return `salesforce-sync-${connectorId}-query-${queryId}`;
  } else {
    return `salesforce-sync-${connectorId}-query-${queryId}-full`;
  }
}

export async function salesforceSyncQueryWorkflow({
  connectorId,
  queryId,
  upToLastModifiedDateTs,
}: {
  connectorId: ModelId;
  queryId: ModelId;
  upToLastModifiedDateTs: number | null;
}) {
  await upsertSyncedQueryRootNode(connectorId, { queryId });

  let lastSeenModifiedDateTs: number | null = null;
  let lastModifiedDateCursorTs: number | null = null;
  let hasMore = true;

  while (hasMore) {
    ({ lastSeenModifiedDateTs, lastModifiedDateCursorTs, hasMore } =
      await processSyncedQueryPage(connectorId, {
        queryId,
        lastModifiedDateCursorTs,
        limit: SALESFORCE_SYNC_QUERY_PAGE_LIMIT,
        lastSeenModifiedDateTs,
        upToLastModifiedDateTs,
      }));
  }

  // Finally update the lastSeenModifiedDate for the syncedQuery
  if (lastSeenModifiedDateTs) {
    const lastSeenModifiedDate = new Date(lastSeenModifiedDateTs);
    await updateSyncedQueryLastSeenModifiedDate(connectorId, {
      queryId,
      lastSeenModifiedDate,
    });
  }
}
