import { proxyActivities, setHandler } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/salesforce/temporal/activities";
import { resyncSignal } from "@connectors/connectors/salesforce/temporal/signals";
// import type * as sync_status from "@connectors/lib/sync_status";
import type { ModelId } from "@connectors/types";

// const { syncSucceeded, syncStarted } = proxyActivities<typeof sync_status>({
//   startToCloseTimeout: "10 minutes",
// });

const {
  syncSalesforceConnection,
  upsertSyncedQueryRootNode,
  updateSyncedQueryLastSeenModifiedDate,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

const { processSyncedQueryPage } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minute",
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
    await syncSalesforceConnection(connectorId);
  } while (signaled);
}

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
  upToLastModifiedDate: Date | null
): string {
  if (upToLastModifiedDate) {
    return `salesforce-sync-${connectorId}-query-${queryId}`;
  } else {
    return `salesforce-sync-${connectorId}-query-${queryId}-full`;
  }
}

export async function salesforceSyncQueryWorkflow({
  connectorId,
  queryId,
  upToLastModifiedDate,
}: {
  connectorId: ModelId;
  queryId: ModelId;
  upToLastModifiedDate: Date | null;
}) {
  await upsertSyncedQueryRootNode(connectorId, { queryId });

  let offset = 0;
  let lastSeenModifiedDate: Date | null = null;
  let hasMore = true;

  while (hasMore) {
    ({ lastSeenModifiedDate, hasMore } = await processSyncedQueryPage(
      connectorId,
      {
        queryId,
        offset,
        limit: SALESFORCE_SYNC_QUERY_PAGE_LIMIT,
        lastSeenModifiedDate,
        upToLastModifiedDate,
      }
    ));

    offset += SALESFORCE_SYNC_QUERY_PAGE_LIMIT;
  }

  // Finally update the lastSeenModifiedDate for the syncedQuery
  if (lastSeenModifiedDate) {
    await updateSyncedQueryLastSeenModifiedDate(connectorId, {
      queryId,
      lastSeenModifiedDate,
    });
  }
}
