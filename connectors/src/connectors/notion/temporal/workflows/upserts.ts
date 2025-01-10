import type { ModelId } from "@dust-tt/types";
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

const {
  garbageCollectorMarkAsSeenAndReturnNewEntities,
  fetchDatabaseChildPages,
  upsertDatabaseStructuredDataFromCache,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

export async function upsertDatabase({
  connectorId,
  databaseId,
  runTimestamp,
  topLevelWorkflowId,
  isGarbageCollectionRun,
  isBatchSync,
  queue,
  forceResync,
}: {
  connectorId: ModelId;
  databaseId: string;
  runTimestamp: number;
  topLevelWorkflowId: string;
  isGarbageCollectionRun: boolean;
  isBatchSync: boolean;
  queue: PQueue;
  forceResync: boolean;
}) {
  let cursor: string | null = null;
  let pageIndex = 0;
  const loggerArgs = {
    connectorId,
  };
  const promises = [];
  do {
    const { pageIds, nextCursor } = await fetchDatabaseChildPages({
      connectorId,
      databaseId,
      cursor,
      loggerArgs: {
        ...loggerArgs,
        pageIndex,
      },
      // This prevents syncing pages that are already up to date, unless
      // this is the first run for this database, a garbage collection run or a force resync.
      returnUpToDatePageIdsForExistingDatabase:
        isGarbageCollectionRun || forceResync,
      runTimestamp,
      topLevelWorkflowId,
      storeInCache: true,
    });
    cursor = nextCursor;
    pageIndex += 1;
    const upsertsPromise = performUpserts({
      connectorId,
      pageIds,
      // we don't upsert any databases in this workflow
      databaseIds: [],
      isGarbageCollectionRun,
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

  return Promise.all(promises);
}

export async function performUpserts({
  connectorId,
  pageIds,
  databaseIds,
  isGarbageCollectionRun,
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
  isGarbageCollectionRun: boolean;
  runTimestamp: number;
  pageIndex: number | null;
  isBatchSync: boolean;
  queue: PQueue;
  childWorkflowsNameSuffix?: string;
  topLevelWorkflowId: string;
  forceResync: boolean;
}): Promise<void> {
  let pagesToSync: string[] = [];
  let databasesToSync: string[] = [];

  const promises: Promise<void>[] = [];

  if (isGarbageCollectionRun) {
    // Mark pages and databases as visited to avoid deleting them and return pages and databases
    // that are new.
    const { newPageIds, newDatabaseIds } =
      await garbageCollectorMarkAsSeenAndReturnNewEntities({
        connectorId,
        pageIds,
        databaseIds,
        runTimestamp,
      });
    pagesToSync = newPageIds;
    databasesToSync = newDatabaseIds;
  } else {
    pagesToSync = pageIds;
    databasesToSync = databaseIds;
  }

  if (!pagesToSync.length && !databasesToSync.length) {
    return;
  }

  if (pagesToSync.length) {
    for (
      let i = 0;
      i < pagesToSync.length;
      i += MAX_PAGE_IDS_PER_CHILD_WORKFLOW
    ) {
      const batch = pagesToSync.slice(i, i + MAX_PAGE_IDS_PER_CHILD_WORKFLOW);
      const batchIndex = Math.floor(i / MAX_PAGE_IDS_PER_CHILD_WORKFLOW);
      let workflowId =
        pageIndex !== null
          ? `${topLevelWorkflowId}-result-page-${pageIndex}-pages-${batchIndex}`
          : `${topLevelWorkflowId}-upserts-pages-${batchIndex}`;
      if (isGarbageCollectionRun) {
        workflowId += "-gc";
      }
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

  if (databasesToSync.length) {
    for (
      let i = 0;
      i < databasesToSync.length;
      i += MAX_PAGE_IDS_PER_CHILD_WORKFLOW
    ) {
      const batch = databasesToSync.slice(
        i,
        i + MAX_PAGE_IDS_PER_CHILD_WORKFLOW
      );
      const batchIndex = Math.floor(i / MAX_PAGE_IDS_PER_CHILD_WORKFLOW);
      let workflowId =
        pageIndex !== null
          ? `${topLevelWorkflowId}-result-page-${pageIndex}-databases-${batchIndex}`
          : `${topLevelWorkflowId}-upserts-databases-${batchIndex}`;
      if (isGarbageCollectionRun) {
        workflowId += "-gc";
      }
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
                isGarbageCollectionRun,
                isBatchSync,
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
