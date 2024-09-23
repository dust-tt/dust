import type { ModelId, NotionGarbageCollectionMode } from "@dust-tt/types";
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

const { garbageCollectBatch } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minute",
  heartbeatTimeout: "5 minute",
});

const { updateParentsFields } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minute",
  heartbeatTimeout: "5 minute",
});

const {
  getPagesAndDatabasesToSync,
  garbageCollectorMarkAsSeenAndReturnNewEntities,
  fetchDatabaseChildPages,
  createResourcesNotSeenInGarbageCollectionRunBatches,
  completeGarbageCollectionRun,
  cachePage,
  cacheBlockChildren,
  renderAndUpsertPageFromCache,
  clearWorkflowCache,
  getDiscoveredResourcesFromCache,
  upsertDatabaseStructuredDataFromCache,
  upsertDatabaseInConnectorsDb,
  deletePageOrDatabaseIfArchived,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

const { saveSuccessSync, saveStartSync, shouldGarbageCollect } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "1 minute",
  });

// Notion's "last edited" timestamp is precise to the minute
const SYNC_PERIOD_DURATION_MS = 60_000;

// How long to wait before checking for new pages again
const INTERVAL_BETWEEN_SYNCS_MS = 60_000; // 1 minute

const MAX_CONCURRENT_CHILD_WORKFLOWS = 1;
const MAX_PAGE_IDS_PER_CHILD_WORKFLOW = 100;

const MAX_PENDING_UPSERT_ACTIVITIES = 5;

const MAX_PENDING_GARBAGE_COLLECTION_ACTIVITIES = 1;

// If set to true, the workflow will process all discovered resources until empty.
const PROCESS_ALL_DISCOVERED_RESOURCES = false;

export const getLastSyncPeriodTsQuery = defineQuery<number | null, []>(
  "getLastSyncPeriodTs"
);

function preProcessTimestampForNotion(ts: number) {
  return Math.floor(ts / SYNC_PERIOD_DURATION_MS) * SYNC_PERIOD_DURATION_MS;
}

// This is the main top-level workflow that continuously runs for each notion connector.
// Each connector has 2 instances of this workflow running in parallel:
// - one that handles the "incremental" live sync (garbageCollectionMode = "never")
// - one that continuously runs garbage collection (garbageCollectionMode = "always")
export async function notionSyncWorkflow({
  connectorId,
  startFromTs,
  forceResync,
  garbageCollectionMode,
}: {
  connectorId: ModelId;
  startFromTs: number | null;
  forceResync: boolean;
  garbageCollectionMode: NotionGarbageCollectionMode;
}) {
  const topLevelWorkflowId = workflowInfo().workflowId;

  let lastSyncedPeriodTs: number | null = startFromTs
    ? preProcessTimestampForNotion(startFromTs)
    : null;

  setHandler(getLastSyncPeriodTsQuery, () => lastSyncedPeriodTs);

  const isGarbageCollectionRun = await shouldGarbageCollect({
    connectorId,
    garbageCollectionMode,
  });

  if (!isGarbageCollectionRun && garbageCollectionMode === "always") {
    // If this is a "perpetual garbage collection" workflow but we cannot garbage collect (eg, we have never completed
    // a full sync, or there is a full resync in progress), we wait until we can garbage collect (and check every 5 minute).

    await sleep(60_000 * 5); // 5 minutes
    await continueAsNew<typeof notionSyncWorkflow>({
      connectorId,
      startFromTs: lastSyncedPeriodTs,
      garbageCollectionMode,
      forceResync: false,
    });
    return;
  }

  const isInitialSync = !lastSyncedPeriodTs;

  if (!isGarbageCollectionRun) {
    await saveStartSync(connectorId);
  }

  // clear the connector cache before each sync
  await clearWorkflowCache({ connectorId, topLevelWorkflowId });

  const runTimestamp = Date.now();

  let cursors: (string | null)[] = [null, null];
  let pageIndex = 0;
  const childWorkflowQueue = new PQueue({
    concurrency: MAX_CONCURRENT_CHILD_WORKFLOWS,
  });

  const promises: Promise<void>[] = [];

  // we go through each result page of the notion search API
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
        // Only pass non-null cursors.
        cursors: cursors.filter((c) => c !== null) as string[],
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

    // Update the cursors array to keep only the last 2 cursors.
    cursors = [cursors[1] ?? null, nextCursor];

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
        topLevelWorkflowId,
        forceResync,
      })
    );
  } while (cursors[1]);

  // wait for all child workflows to finish
  await Promise.all(promises);

  if (isGarbageCollectionRun || isInitialSync) {
    // These are resources (pages/DBs) that we didn't get from the search API but that are
    // child/parent pages/DBs of other pages that we did get from the search API. We upsert those as
    // well.
    let discoveredResources: {
      pageIds: string[];
      databaseIds: string[];
    } | null;
    do {
      discoveredResources = await getDiscoveredResourcesFromCache({
        connectorId,
        topLevelWorkflowId,
      });
      if (discoveredResources) {
        await performUpserts({
          connectorId,
          pageIds: discoveredResources.pageIds,
          databaseIds: discoveredResources.databaseIds,
          isGarbageCollectionRun: isGarbageCollectionRun,
          runTimestamp,
          pageIndex: null,
          isBatchSync: isInitialSync,
          queue: childWorkflowQueue,
          childWorkflowsNameSuffix: "discovered",
          topLevelWorkflowId,
          forceResync,
        });
      }
    } while (discoveredResources && PROCESS_ALL_DISCOVERED_RESOURCES);
  }

  // Compute parents after all documents are added/updated.
  // We only do this if it's not a garbage collection run, to prevent race conditions.
  if (!isGarbageCollectionRun) {
    await updateParentsFields(connectorId);
  }

  if (!isGarbageCollectionRun) {
    await saveSuccessSync(connectorId);
    lastSyncedPeriodTs = preProcessTimestampForNotion(runTimestamp);
  } else {
    // Look at pages and databases that were not visited in this run, check with the notion API if
    // they were really deleted and delete them from the database if they were.
    // Find the resources not seen in the GC run

    // Create batches of resources to check, by chunk of 100
    const nbOfBatches =
      await createResourcesNotSeenInGarbageCollectionRunBatches({
        connectorId,
        batchSize: 100,
      });

    // For each chunk, run a garbage collection activity
    const queue = new PQueue({
      concurrency: MAX_PENDING_GARBAGE_COLLECTION_ACTIVITIES,
    });
    const promises: Promise<void>[] = [];
    for (let batchIndex = 0; batchIndex < nbOfBatches; batchIndex++) {
      promises.push(
        queue.add(async () =>
          garbageCollectBatch({
            connectorId,
            runTimestamp,
            batchIndex,
            startTs: new Date().getTime(),
          })
        )
      );
    }

    await Promise.all(promises);

    // Once done, clear all the redis keys used for garbage collection
    await completeGarbageCollectionRun(connectorId, nbOfBatches);
  }

  await sleep(INTERVAL_BETWEEN_SYNCS_MS);

  await continueAsNew<typeof notionSyncWorkflow>({
    connectorId,
    startFromTs: lastSyncedPeriodTs,
    garbageCollectionMode,
    forceResync: false,
  });
}

// Top level workflow to be used by the CLI or by Poké in order to force-refresh a given Notion page.
export async function upsertPageWorkflow({
  connectorId,
  pageId,
}: {
  connectorId: ModelId;
  pageId: string;
}) {
  const topLevelWorkflowId = workflowInfo().workflowId;
  const runTimestamp = Date.now();

  const queue = new PQueue({
    concurrency: MAX_CONCURRENT_CHILD_WORKFLOWS,
  });

  await clearWorkflowCache({ connectorId, topLevelWorkflowId });

  const { skipped } = await executeChild(upsertPageChildWorkflow, {
    workflowId: `${topLevelWorkflowId}-upsert-page-${pageId}`,
    searchAttributes: {
      connectorId: [connectorId],
    },
    args: [
      {
        connectorId,
        pageId,
        runTimestamp,
        isBatchSync: false,
        pageIndex: 0,
        topLevelWorkflowId,
      },
    ],
    parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
    memo: workflowInfo().memo,
  });

  // These are resources (pages/DBs) that we stumbled upon but don't know about. We upsert those as
  // well.
  let discoveredResources: {
    pageIds: string[];
    databaseIds: string[];
  } | null;
  do {
    discoveredResources = await getDiscoveredResourcesFromCache({
      connectorId,
      topLevelWorkflowId,
    });
    if (discoveredResources) {
      await performUpserts({
        connectorId,
        pageIds: discoveredResources.pageIds,
        databaseIds: discoveredResources.databaseIds,
        isGarbageCollectionRun: false,
        runTimestamp,
        pageIndex: null,
        isBatchSync: true,
        queue,
        childWorkflowsNameSuffix: "discovered",
        topLevelWorkflowId,
        forceResync: false,
      });
    }
  } while (discoveredResources);

  const loggerArgs = {
    connectorId,
    pageId,
  };

  await clearWorkflowCache({ connectorId, topLevelWorkflowId });

  await deletePageOrDatabaseIfArchived({
    connectorId,
    objectId: pageId,
    objectType: "page",
    loggerArgs,
  });

  return { skipped };
}

// Top level workflow to be used by the CLI or by Poké in order to force-refresh a given Notion database.
export async function upsertDatabaseWorkflow({
  connectorId,
  databaseId,
  forceResync = false,
}: {
  connectorId: ModelId;
  databaseId: string;
  forceResync?: boolean;
}) {
  const topLevelWorkflowId = workflowInfo().workflowId;

  const queue = new PQueue({
    concurrency: MAX_CONCURRENT_CHILD_WORKFLOWS,
  });

  const runTimestamp = Date.now();

  const loggerArgs = {
    connectorId,
    databaseId,
  };

  await clearWorkflowCache({ connectorId, topLevelWorkflowId });

  await upsertDatabaseInConnectorsDb(
    connectorId,
    databaseId,
    Date.now(),
    topLevelWorkflowId,
    loggerArgs
  );

  await upsertDatabase({
    connectorId,
    databaseId,
    runTimestamp,
    topLevelWorkflowId,
    isGarbageCollectionRun: false,
    isBatchSync: false,
    queue,
    forceResync,
  });

  // These are resources (pages/DBs) that we stumbled upon but don't know about. We upsert those as
  // well.
  let discoveredResources: {
    pageIds: string[];
    databaseIds: string[];
  } | null;
  do {
    discoveredResources = await getDiscoveredResourcesFromCache({
      connectorId,
      topLevelWorkflowId,
    });
    if (discoveredResources) {
      await performUpserts({
        connectorId,
        pageIds: discoveredResources.pageIds,
        databaseIds: discoveredResources.databaseIds,
        isGarbageCollectionRun: false,
        runTimestamp,
        pageIndex: null,
        isBatchSync: true,
        queue,
        childWorkflowsNameSuffix: "discovered",
        topLevelWorkflowId,
        forceResync: false,
      });
    }
  } while (discoveredResources);

  await clearWorkflowCache({ connectorId, topLevelWorkflowId });

  await deletePageOrDatabaseIfArchived({
    connectorId,
    objectId: databaseId,
    objectType: "database",
    loggerArgs,
  });
}

/*
 ** AFTER THIS POINT, ALL WORKFLOWS ARE CHILD WORKFLOWS AND SHOULD ONLY BE CALLED BY A TOP-LEVEL WORKFLOW DEFINED ABOVE.
 */

export async function upsertPageChildWorkflow({
  connectorId,
  pageId,
  runTimestamp,
  isBatchSync,
  pageIndex,
  topLevelWorkflowId,
}: {
  connectorId: ModelId;
  pageId: string;
  runTimestamp: number;
  isBatchSync: boolean;
  pageIndex: number;
  topLevelWorkflowId: string;
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
    topLevelWorkflowId,
  });

  if (skipped) {
    return {
      skipped,
    };
  }

  let cursor: string | null = null;
  let blockIndexInPage = 0;
  do {
    const { nextCursor, blocksWithChildren, blocksCount } =
      await cacheBlockChildren({
        connectorId,
        pageId,
        blockId: null,
        cursor,
        currentIndexInParent: blockIndexInPage,
        loggerArgs,
        topLevelWorkflowId,
      });
    cursor = nextCursor;
    blockIndexInPage += blocksCount;

    for (const block of blocksWithChildren) {
      await executeChild(notionProcessBlockChildrenChildWorkflow, {
        workflowId: `${topLevelWorkflowId}-page-${pageId}-block-${block}-children`,
        searchAttributes: {
          connectorId: [connectorId],
        },
        args: [{ connectorId, pageId, blockId: block, topLevelWorkflowId }],
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
    topLevelWorkflowId,
  });

  return {
    skipped,
  };
}

export async function notionProcessBlockChildrenChildWorkflow({
  connectorId,
  pageId,
  blockId,
  topLevelWorkflowId,
}: {
  connectorId: ModelId;
  pageId: string;
  blockId: string;
  topLevelWorkflowId: string;
}): Promise<void> {
  const loggerArgs = {
    connectorId,
  };

  let cursor: string | null = null;
  let blockIndexInParent = 0;

  do {
    const { nextCursor, blocksWithChildren, blocksCount } =
      await cacheBlockChildren({
        connectorId,
        pageId,
        blockId,
        cursor,
        currentIndexInParent: blockIndexInParent,
        topLevelWorkflowId,
        loggerArgs,
      });
    cursor = nextCursor;
    blockIndexInParent += blocksCount;

    for (const block of blocksWithChildren) {
      await executeChild(notionProcessBlockChildrenChildWorkflow, {
        workflowId: `${topLevelWorkflowId}-page-${pageId}-block-${block}-children`,
        searchAttributes: {
          connectorId: [connectorId],
        },
        args: [{ connectorId, pageId, blockId: block, topLevelWorkflowId }],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
        memo: workflowInfo().memo,
      });
    }
  } while (cursor);
}

export async function syncResultPageChildWorkflow({
  connectorId,
  pageIds,
  runTimestamp,
  isBatchSync,
  topLevelWorkflowId,
}: {
  connectorId: ModelId;
  pageIds: string[];
  runTimestamp: number;
  isBatchSync: boolean;
  topLevelWorkflowId: string;
}): Promise<void> {
  const upsertQueue = new PQueue({
    concurrency: MAX_PENDING_UPSERT_ACTIVITIES,
  });

  const promises: Promise<unknown>[] = [];

  for (const [pageIndex, pageId] of pageIds.entries()) {
    promises.push(
      upsertQueue.add(() =>
        executeChild(upsertPageChildWorkflow, {
          workflowId: `${topLevelWorkflowId}-upsert-page-${pageId}`,
          searchAttributes: {
            connectorId: [connectorId],
          },
          args: [
            {
              connectorId,
              pageId,
              runTimestamp,
              isBatchSync,
              pageIndex,
              topLevelWorkflowId,
            },
          ],
          parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
          memo: workflowInfo().memo,
        })
      )
    );
  }

  await Promise.all(promises);
}

export async function syncResultPageDatabaseChildWorkflow({
  connectorId,
  databaseIds,
  runTimestamp,
  isGarbageCollectionRun,
  isBatchSync,
  topLevelWorkflowId,
  forceResync,
}: {
  connectorId: ModelId;
  databaseIds: string[];
  runTimestamp: number;
  isGarbageCollectionRun: boolean;
  isBatchSync: boolean;
  topLevelWorkflowId: string;
  forceResync: boolean;
}): Promise<void> {
  const upsertQueue = new PQueue({
    concurrency: MAX_PENDING_UPSERT_ACTIVITIES,
  });
  const workflowQueue = new PQueue({
    concurrency: MAX_CONCURRENT_CHILD_WORKFLOWS,
  });

  let promises: Promise<void | void[]>[] = [];

  for (const [databaseIndex, databaseId] of databaseIds.entries()) {
    const loggerArgs = {
      connectorId,
      databaseIndex,
    };

    promises.push(
      upsertQueue.add(() =>
        upsertDatabaseInConnectorsDb(
          connectorId,
          databaseId,
          runTimestamp,
          topLevelWorkflowId,
          loggerArgs
        )
      )
    );
  }

  // wait for all db upserts before moving on to the children pages
  // otherwise we don't have control over concurrency
  await Promise.all(promises);
  promises = [];

  for (const databaseId of databaseIds) {
    promises.push(
      upsertDatabase({
        connectorId,
        databaseId,
        runTimestamp,
        topLevelWorkflowId,
        isGarbageCollectionRun,
        isBatchSync,
        queue: workflowQueue,
        forceResync,
      })
    );
  }

  await Promise.all(promises);
}

async function upsertDatabase({
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
