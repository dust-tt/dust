import { ModelId } from "@dust-tt/types";
import {
  continueAsNew,
  defineQuery,
  executeChild,
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/notion/temporal/activities";

import { getWorkflowIdV2 } from "./utils";

const { garbageCollect } = proxyActivities<typeof activities>({
  startToCloseTimeout: "120 minute",
});

const { upsertDatabase, updateParentsFields } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "60 minute",
});

const {
  getPagesAndDatabasesToSync,
  garbageCollectorMarkAsSeen,
  fetchDatabaseChildPages,
  cachePage,
  cacheBlockChildren,
  cacheDatabaseChildren,
  renderAndUpsertPageFromCache,
  clearConnectorCache,
  getDiscoveredResourcesFromCache,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

const { saveSuccessSync, saveStartSync, shouldGarbageCollect } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "1 minute",
  });

// soft limit on the number of iterations of the loop that should be ran in a single workflow
// before "continuing as new" to avoid hitting the workflow log size limit
const MAX_ITERATIONS_PER_WORKFLOW = 32;

// Notion's "last edited" timestamp is precise to the minute
const SYNC_PERIOD_DURATION_MS = 60_000;

// How long to wait before checking for new pages again
const INTERVAL_BETWEEN_SYNCS_MS = 60_000; // 1 minute

const MAX_CONCURRENT_CHILD_WORKFLOWS = 1;
const MAX_PAGE_IDS_PER_CHILD_WORKFLOW = 100;

const MAX_PENDING_UPSERT_ACTIVITIES = 5;

export const getLastSyncPeriodTsQuery = defineQuery<number | null, []>(
  "getLastSyncPeriodTs"
);

function preProcessTimestampForNotion(ts: number) {
  return Math.floor(ts / SYNC_PERIOD_DURATION_MS) * SYNC_PERIOD_DURATION_MS;
}

export async function notionSyncWorkflow({
  connectorId,
  startFromTs,
  forceResync,
}: {
  connectorId: ModelId;
  startFromTs: number | null;
  forceResync: boolean;
}) {
  let iterations = 0;

  let lastSyncedPeriodTs: number | null = startFromTs
    ? preProcessTimestampForNotion(startFromTs)
    : null;

  setHandler(getLastSyncPeriodTsQuery, () => lastSyncedPeriodTs);

  const isGarbageCollectionRun = await shouldGarbageCollect(connectorId);

  const isInitialSync = !lastSyncedPeriodTs;

  do {
    if (!isGarbageCollectionRun) {
      await saveStartSync(connectorId);
    }

    // clear the connector cache before each sync
    await clearConnectorCache(connectorId);

    const runTimestamp = Date.now();

    let cursor: string | null = null;
    let pageIndex = 0;
    const childWorkflowQueue = new PQueue({
      concurrency: MAX_CONCURRENT_CHILD_WORKFLOWS,
    });

    const promises: Promise<void>[] = [];

    // we go through each result page of the notion  search API
    do {
      // We only want to fetch pages that were updated since the last sync unless it's a garbage
      // collection run or a force resync.
      const skipUpToDatePages = !isGarbageCollectionRun && !forceResync;

      const { pageIds, databaseIds, nextCursor } =
        await getPagesAndDatabasesToSync({
          connectorId,
          // If we're doing a garbage collection run, we want to fetch all pages otherwise, we only
          // want to fetch pages that were updated since the last sync.
          lastSyncedAt: !isGarbageCollectionRun ? lastSyncedPeriodTs : null,
          cursor,
          excludeUpToDatePages: skipUpToDatePages,
          loggerArgs: {
            pageIndex,
            runType: isGarbageCollectionRun
              ? "garbageCollection"
              : isInitialSync
              ? "initialSync"
              : "incrementalSync",
          },
        });
      cursor = nextCursor;
      pageIndex += 1;

      // this function triggers child workflows to process batches of pages and databases.
      // the worflow that processes databases will itself trigger child workflows to process
      // batches of child pages.
      promises.push(
        performUpserts({
          connectorId,
          pageIds,
          databaseIds,
          isGarbageCollectionRun: isGarbageCollectionRun,
          runTimestamp,
          pageIndex,
          isBatchSync: isInitialSync,
          queue: childWorkflowQueue,
        })
      );
    } while (cursor);

    // wait for all child workflows to finish
    await Promise.all(promises);

    await updateParentsFields(connectorId, runTimestamp, new Date().getTime());

    // these are resources (pages/DBs) that we didn't get from the search API but that are child pages/DBs
    // of other pages that we did get from the search API.
    // We upsert those as well.
    const discoveredResources = await getDiscoveredResourcesFromCache(
      connectorId
    );
    await performUpserts({
      connectorId,
      pageIds: discoveredResources.pageIds,
      databaseIds: discoveredResources.databaseIds,
      isGarbageCollectionRun: isGarbageCollectionRun,
      runTimestamp,
      pageIndex,
      isBatchSync: isInitialSync,
      queue: childWorkflowQueue,
      childWorkflowsNameSuffix: "discovered",
    });

    if (!isGarbageCollectionRun) {
      await saveSuccessSync(connectorId);
      lastSyncedPeriodTs = preProcessTimestampForNotion(runTimestamp);
    } else {
      // Look at pages and databases that were not visited in this run, check with the notion API if
      // they were really deleted and delete them from the database if they were.
      await garbageCollect({
        connectorId,
        runTimestamp,
        startTs: new Date().getTime(),
      });
    }

    iterations += 1;
    await sleep(INTERVAL_BETWEEN_SYNCS_MS);
  } while (
    // We run the loop for MAX_ITERATIONS_PER_WORKFLOW iterations to avoid hitting the workflow log
    // size limit and "continue as new" to start a new workflow.
    // If it's the initial sync, a force resync, or a garbage collection run, we only do one
    // iteration.
    !isInitialSync &&
    !forceResync &&
    !isGarbageCollectionRun &&
    iterations < MAX_ITERATIONS_PER_WORKFLOW
  );

  await continueAsNew<typeof notionSyncWorkflow>({
    connectorId,
    startFromTs: lastSyncedPeriodTs,
    forceResync: false,
  });
}

export async function upsertPageWorkflow({
  connectorId,
  pageId,
  runTimestamp,
  isBatchSync,
  pageIndex,
}: {
  connectorId: ModelId;
  pageId: string;
  runTimestamp: number;
  isBatchSync: boolean;
  pageIndex: number;
}): Promise<{
  skipped: boolean;
}> {
  const loggerArgs = {
    connectorId,
    pageIndex,
  };

  const { skipped } = await cachePage({
    connectorId,
    pageId,
    loggerArgs,
    runTimestamp,
  });

  if (skipped) {
    return {
      skipped,
    };
  }

  let cursor: string | null = null;
  let blockIndexInPage = 0;
  do {
    const { nextCursor, blocksWithChildren, childDatabases, blocksCount } =
      await cacheBlockChildren({
        connectorId,
        pageId,
        blockId: null,
        cursor,
        currentIndexInParent: blockIndexInPage,
        loggerArgs,
      });
    cursor = nextCursor;
    blockIndexInPage += blocksCount;

    for (const block of blocksWithChildren) {
      await executeChild(notionProcessBlockChildrenWorkflow, {
        workflowId: `${getWorkflowIdV2(
          connectorId
        )}-page-${pageId}-block-${block}-children`,
        args: [{ connectorId, pageId, blockId: block }],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
        memo: workflowInfo().memo,
      });
    }
    for (const databaseId of childDatabases) {
      await executeChild(processChildDatabaseWorkflow, {
        workflowId: `${getWorkflowIdV2(
          connectorId
        )}-page-${pageId}-child-database-${databaseId}`,
        args: [{ connectorId, databaseId }],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
        memo: workflowInfo().memo,
      });
    }
  } while (cursor);

  await renderAndUpsertPageFromCache({
    connectorId,
    pageId,
    loggerArgs,
    runTimestamp,
    isFullSync: isBatchSync,
  });

  return {
    skipped,
  };
}

export async function notionProcessBlockChildrenWorkflow({
  connectorId,
  pageId,
  blockId,
}: {
  connectorId: ModelId;
  pageId: string;
  blockId: string;
}): Promise<void> {
  const loggerArgs = {
    connectorId,
  };

  let cursor: string | null = null;
  let blockIndexInParent = 0;

  do {
    const { nextCursor, blocksWithChildren, childDatabases, blocksCount } =
      await cacheBlockChildren({
        connectorId,
        pageId,
        blockId,
        cursor,
        currentIndexInParent: blockIndexInParent,
        loggerArgs,
      });
    cursor = nextCursor;
    blockIndexInParent += blocksCount;

    for (const block of blocksWithChildren) {
      await executeChild(notionProcessBlockChildrenWorkflow, {
        workflowId: `${getWorkflowIdV2(
          connectorId
        )}-page-${pageId}-block-${block}-children`,
        args: [{ connectorId, pageId, blockId: block }],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
        memo: workflowInfo().memo,
      });
    }
    for (const databaseId of childDatabases) {
      await executeChild(processChildDatabaseWorkflow, {
        workflowId: `${getWorkflowIdV2(
          connectorId
        )}-page-${pageId}-child-database-${databaseId}`,
        args: [{ connectorId, databaseId }],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
        memo: workflowInfo().memo,
      });
    }
  } while (cursor);
}

export async function processChildDatabaseWorkflow({
  connectorId,
  databaseId,
}: {
  connectorId: ModelId;
  databaseId: string;
}): Promise<void> {
  const loggerArgs = {
    connectorId,
  };

  let cursor: string | null = null;
  do {
    const { nextCursor } = await cacheDatabaseChildren({
      connectorId,
      databaseId,
      cursor,
      loggerArgs,
    });
    cursor = nextCursor;
  } while (cursor);
}

export async function syncResultPageWorkflow({
  connectorId,
  pageIds,
  runTimestamp,
  isBatchSync,
}: {
  connectorId: ModelId;
  pageIds: string[];
  runTimestamp: number;
  isBatchSync: boolean;
}): Promise<void> {
  const upsertQueue = new PQueue({
    concurrency: MAX_PENDING_UPSERT_ACTIVITIES,
  });

  const promises: Promise<unknown>[] = [];

  for (const [pageIndex, pageId] of pageIds.entries()) {
    promises.push(
      upsertQueue.add(() =>
        executeChild(upsertPageWorkflow, {
          workflowId: `${getWorkflowIdV2(connectorId)}-upsert-page-${pageId}`,
          args: [{ connectorId, pageId, runTimestamp, isBatchSync, pageIndex }],
          parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
          memo: workflowInfo().memo,
        })
      )
    );
  }

  await Promise.all(promises);
}

export async function syncResultPageDatabaseWorkflow({
  connectorId,
  databaseIds,
  runTimestamp,
  isGarbageCollectionRun,
  isBatchSync,
}: {
  connectorId: ModelId;
  databaseIds: string[];
  runTimestamp: number;
  isGarbageCollectionRun: boolean;
  isBatchSync: boolean;
}): Promise<void> {
  const upsertQueue = new PQueue({
    concurrency: MAX_PENDING_UPSERT_ACTIVITIES,
  });
  const workflowQueue = new PQueue({
    concurrency: MAX_CONCURRENT_CHILD_WORKFLOWS,
  });

  let promises: Promise<void>[] = [];

  for (const [databaseIndex, databaseId] of databaseIds.entries()) {
    const loggerArgs = {
      connectorId,
      databaseIndex,
    };

    promises.push(
      upsertQueue.add(() =>
        upsertDatabase(connectorId, databaseId, runTimestamp, loggerArgs)
      )
    );
  }

  // wait for all db upserts before moving on to the children pages
  // otherwise we don't have control over concurrency
  await Promise.all(promises);
  promises = [];

  for (const databaseId of databaseIds) {
    let cursor: string | null = null;
    let pageIndex = 0;
    const loggerArgs = {
      connectorId,
    };
    do {
      const { pageIds, nextCursor } = await fetchDatabaseChildPages({
        connectorId,
        databaseId,
        cursor,
        loggerArgs: {
          ...loggerArgs,
          pageIndex,
        },
        // This will prevent syncing pages that are already up to date, unless
        // this is the first run for this database or a garbage collection run.
        excludeUpToDatePages: !isGarbageCollectionRun,
        runTimestamp,
      });
      cursor = nextCursor;
      pageIndex += 1;
      const upsertsPromise = performUpserts({
        connectorId,
        pageIds,
        databaseIds: [], // we don't upsert any databases in this workflow
        isGarbageCollectionRun,
        runTimestamp,
        pageIndex,
        isBatchSync,
        queue: workflowQueue,
        childWorkflowsNameSuffix: `database-children-${databaseId}`,
      });

      promises.push(upsertsPromise);
    } while (cursor);
  }

  await Promise.all(promises);
}

async function performUpserts({
  connectorId,
  pageIds,
  databaseIds,
  isGarbageCollectionRun,
  runTimestamp,
  pageIndex,
  isBatchSync,
  queue,
  childWorkflowsNameSuffix = "",
}: {
  connectorId: ModelId;
  pageIds: string[];
  databaseIds: string[];
  isGarbageCollectionRun: boolean;
  runTimestamp: number;
  pageIndex: number;
  isBatchSync: boolean;
  queue: PQueue;
  childWorkflowsNameSuffix?: string;
}): Promise<void> {
  let pagesToSync: string[] = [];
  let databasesToSync: string[] = [];

  const promises: Promise<void>[] = [];

  if (isGarbageCollectionRun) {
    // Mark pages and databases as visited to avoid deleting them and return pages and databases
    // that are new.
    const { newPageIds, newDatabaseIds } = await garbageCollectorMarkAsSeen({
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
      let workflowId = `${getWorkflowIdV2(
        connectorId
      )}-result-page-${pageIndex}-pages-${batchIndex}`;
      if (isGarbageCollectionRun) {
        workflowId += "-gc";
      }
      if (childWorkflowsNameSuffix) {
        workflowId += `-${childWorkflowsNameSuffix}`;
      }

      promises.push(
        queue.add(() =>
          executeChild(syncResultPageWorkflow, {
            workflowId,
            args: [
              {
                connectorId,
                runTimestamp,
                isBatchSync,
                pageIds: batch,
              },
            ],
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
      let workflowId = `${getWorkflowIdV2(
        connectorId
      )}-result-page-${pageIndex}-databases-${batchIndex}`;
      if (isGarbageCollectionRun) {
        workflowId += "-gc";
      }
      if (childWorkflowsNameSuffix) {
        workflowId += `-${childWorkflowsNameSuffix}`;
      }

      promises.push(
        queue.add(() =>
          executeChild(syncResultPageDatabaseWorkflow, {
            workflowId,
            args: [
              {
                connectorId,
                runTimestamp,
                isGarbageCollectionRun,
                isBatchSync,
                databaseIds: batch,
              },
            ],
            parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
            memo: workflowInfo().memo,
          })
        )
      );
    }
  }

  await Promise.all(promises);
}
