import { proxyActivities, setHandler } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/salesforce/temporal/activities";
import { resyncSignal } from "@connectors/connectors/salesforce/temporal/signals";
// import type * as sync_status from "@connectors/lib/sync_status";
import type { ModelId } from "@connectors/types";

// const { syncSucceeded, syncStarted } = proxyActivities<typeof sync_status>({
//   startToCloseTimeout: "10 minutes",
// });

type DateString = string | null;

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
  upToLastModifiedDateString,
}: {
  connectorId: ModelId;
  queryId: ModelId;
  upToLastModifiedDateString: DateString;
}) {
  await upsertSyncedQueryRootNode(connectorId, { queryId });

  let lastSeenModifiedDateString: DateString = null;
  let lastModifiedDateStringCursor: DateString = null;
  let hasMore = true;

  while (hasMore) {
    ({ lastSeenModifiedDateString, lastModifiedDateStringCursor, hasMore } =
      await processSyncedQueryPage(connectorId, {
        queryId,
        lastModifiedDateStringCursor,
        limit: SALESFORCE_SYNC_QUERY_PAGE_LIMIT,
        lastSeenModifiedDateString,
        upToLastModifiedDateString,
      }));
  }

  // Finally update the lastSeenModifiedDate for the syncedQuery
  if (lastSeenModifiedDateString) {
    const lastSeenModifiedDate = new Date(lastSeenModifiedDateString);
    await updateSyncedQueryLastSeenModifiedDate(connectorId, {
      queryId,
      lastSeenModifiedDate,
    });
  }
}
