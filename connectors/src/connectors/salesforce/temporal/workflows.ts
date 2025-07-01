import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/salesforce/temporal/activities";
// import type * as sync_status from "@connectors/lib/sync_status";
import type { ModelId } from "@connectors/types";

// const { syncSucceeded, syncStarted } = proxyActivities<typeof sync_status>({
//   startToCloseTimeout: "10 minutes",
// });

const { upsertSyncedQueryRootNode, updateSyncedQueryLastSeenModifiedDate } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "10 minute",
  });

const { processSyncedQueryPage } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minute",
});

// Future version once query full/incremental syncing works.

// export async function salesforceSyncWorkflow({
//   connectorId,
// }: {
//   connectorId: ModelId;
// }) {
//   let signaled = false;
//
//   setHandler(resyncSignal, () => {
//     signaled = true;
//   });
//
//   do {
//     signaled = false;
//     await syncStarted(connectorId);
//
//     await executeChild(salesforceSyncTablesWorkflow, {
//       workflowId: makeSalesforceSyncTablesWorkflowId(connectorId),
//       searchAttributes: {
//         connectorId: [connectorId],
//       },
//       args: [{ connectorId }],
//       memo: workflowInfo().memo,
//     });
//
//     // Synced queries
//     const queries = await discoverSalesforceSyncedQueries(connectorId);
//     for (const q of queries) {
//       await executeChild(salesforceSyncQueryWorkflow, {
//         workflowId: makeSalesforceSyncQueryWorkflowId(connectorId, q.id),
//         searchAttributes: {
//           connectorId: [connectorId],
//         },
//         args: [
//           {
//             connectorId,
//             queryId: q.id,
//             upToLastModifiedDate: q.lastSeenModifiedDate,
//           },
//         ],
//         memo: workflowInfo().memo,
//       });
//     }
//
//     await syncSucceeded(connectorId);
//   } while (signaled);
// }
//
// function makeSalesforceSyncTablesWorkflowId(connectorId: ModelId): string {
//   return `salesforce-sync-${connectorId}-tables`;
// }
//
// export async function salesforceSyncTablesWorkflow({
//   connectorId,
// }: {
//   connectorId: ModelId;
// }) {
//   await syncSalesforceConnection(connectorId);
// }

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
