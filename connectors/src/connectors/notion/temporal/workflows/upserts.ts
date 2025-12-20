import {
  executeChild,
  ParentClosePolicy,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";
import type PQueue from "p-queue";

import type * as activities from "@connectors/connectors/notion/temporal/activities";
import { MAX_PAGE_IDS_PER_CHILD_WORKFLOW } from "@connectors/connectors/notion/temporal/config";
import {
  syncResultPageChildWorkflow,
  syncResultPageDatabaseChildWorkflow,
} from "@connectors/connectors/notion/temporal/workflows/children";
import type { ModelId } from "@connectors/types";

const { fetchDatabaseChildPages } = proxyActivities<typeof activities>({
  startToCloseTimeout: "15 minutes",
});

const { upsertDatabaseStructuredDataFromCache } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "30 minutes",
});

const { markDatabasesAsUpserted } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

// This function triggers all the necessary child workflow to upsert
// pages and databases (from the pageIds and databaseIds arrays).
export async function performUpserts({
  connectorId,
  pageIds,
  databaseIds,
  runTimestamp,
  pageIndex,
  isBatchSync,
  queue,
  childWorkflowsNameSuffix = "",
  topLevelWorkflowId,
  forceResync,
}: {
  connectorId: ModelId;
  pageIds: string[];
  databaseIds: string[];
  runTimestamp: number;
  pageIndex: number | null;
  isBatchSync: boolean;
  queue: PQueue;
  childWorkflowsNameSuffix?: string;
  topLevelWorkflowId: string;
  forceResync: boolean;
}): Promise<void> {
  const promises: Promise<void>[] = [];

  if (!pageIds.length && !databaseIds.length) {
    return;
  }

  if (pageIds.length) {
    for (let i = 0; i < pageIds.length; i += MAX_PAGE_IDS_PER_CHILD_WORKFLOW) {
      const batch = pageIds.slice(i, i + MAX_PAGE_IDS_PER_CHILD_WORKFLOW);
      const batchIndex = Math.floor(i / MAX_PAGE_IDS_PER_CHILD_WORKFLOW);
      let workflowId =
        pageIndex !== null
          ? `${topLevelWorkflowId}-result-page-${pageIndex}-pages-${batchIndex}`
          : `${topLevelWorkflowId}-upserts-pages-${batchIndex}`;

      if (childWorkflowsNameSuffix) {
        workflowId += `-${childWorkflowsNameSuffix}`;
      }

      promises.push(
        queue.add(() =>
          executeChild(syncResultPageChildWorkflow, {
            workflowId,
            args: [
              {
                connectorId,
                runTimestamp,
                isBatchSync,
                pageIds: batch,
                topLevelWorkflowId,
              },
            ],
            searchAttributes: {
              connectorId: [connectorId],
            },
            parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
            memo: workflowInfo().memo,
          })
        )
      );
    }
  }

  // In forceResync mode, syncResultPageDatabaseChildWorkflow directly calls upsertDatabaseInCore,
  // which triggers a lot of activities. In that scenario, it's best to process one database at a time.
  const batchSize = forceResync ? 1 : MAX_PAGE_IDS_PER_CHILD_WORKFLOW;
  if (databaseIds.length) {
    for (let i = 0; i < databaseIds.length; i += batchSize) {
      const batch = databaseIds.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize);
      let workflowId =
        pageIndex !== null
          ? `${topLevelWorkflowId}-result-page-${pageIndex}-databases-${batchIndex}`
          : `${topLevelWorkflowId}-upserts-databases-${batchIndex}`;

      if (childWorkflowsNameSuffix) {
        workflowId += `-${childWorkflowsNameSuffix}`;
      }

      promises.push(
        queue.add(() =>
          executeChild(syncResultPageDatabaseChildWorkflow, {
            workflowId,
            args: [
              {
                connectorId,
                runTimestamp,
                databaseIds: batch,
                topLevelWorkflowId,
                forceResync,
              },
            ],
            searchAttributes: {
              connectorId: [connectorId],
            },
            parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
            memo: workflowInfo().memo,
          })
        )
      );
    }
  }

  await Promise.all(promises);
}

// This function triggers all the necessary child workflows to upsert a database.
// Called in:
// - incremental sync, when the database is reported to have been updated
// - force resyncs
// - garbage collection runs, if the database is fully new
// Unless this is a force resync, we skip processing up-to-date pages.
export async function upsertDatabaseInCore({
  connectorId,
  databaseId,
  runTimestamp,
  topLevelWorkflowId,
  queue,
  forceResync,
}: {
  connectorId: ModelId;
  databaseId: string;
  runTimestamp: number;
  topLevelWorkflowId: string;
  queue: PQueue;
  forceResync: boolean;
}) {
  let cursor: string | null = null;
  let pageIndex = 0;
  const loggerArgs = {
    connectorId,
  };
  const promises = [];

  // We immediately mark the database as upserted, to allow the sync process
  // to queue it again while it is being processed.
  const { isNewDatabase, isMissing } = await markDatabasesAsUpserted({
    connectorId,
    databaseIds: [databaseId],
    runTimestamp,
  });

  // The database is missing from our DB (it may have been deleted), so we don't need to process it.
  if (isMissing) {
    return;
  }

  // If the database is new, we consider this to be a "batch sync".
  // We won't trigger individual post upsert hooks for each page.
  const isBatchSync = isNewDatabase;

  do {
    const { pageIds, nextCursor }: { pageIds: string[]; nextCursor: string | null } = await fetchDatabaseChildPages({
      connectorId,
      databaseId,
      cursor,
      loggerArgs: {
        ...loggerArgs,
        pageIndex,
      },
      // Skip processing up-to-date pages unless this is a force resync.
      returnUpToDatePageIdsForExistingDatabase: forceResync,
      topLevelWorkflowId,
      // Store all the child pages in cache.
      storeInCache: true,
    });
    cursor = nextCursor;
    pageIndex += 1;
    const upsertsPromise = performUpserts({
      connectorId,
      pageIds,
      databaseIds: [], // we don't upsert any additional databases in this workflow
      runTimestamp,
      pageIndex,
      isBatchSync,
      queue,
      childWorkflowsNameSuffix: `database-children-${databaseId}`,
      topLevelWorkflowId,
      forceResync,
    });

    promises.push(upsertsPromise);
  } while (cursor);

  promises.push(
    upsertDatabaseStructuredDataFromCache({
      databaseId,
      connectorId,
      topLevelWorkflowId,
      loggerArgs,
      runTimestamp,
    })
  );

  await Promise.all(promises);
}
