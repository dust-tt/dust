import {
  continueAsNew,
  patched,
  proxyActivities,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/notion/temporal/activities";
import {
  GC_BATCHES_PER_RUN,
  INTERVAL_BETWEEN_GC_SYNCS_MS,
  MAX_CONCURRENT_CHILD_WORKFLOWS,
  MAX_PENDING_GARBAGE_COLLECTION_ACTIVITIES,
  MAX_SEARCH_PAGE_GARBAGE_COLLECTION_INDEX,
  PROCESS_ALL_DISCOVERED_RESOURCES,
} from "@connectors/connectors/notion/temporal/config";
import { performUpserts } from "@connectors/connectors/notion/temporal/workflows/upserts";
import type { ModelId } from "@connectors/types";

const { garbageCollectBatch } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minute",
  heartbeatTimeout: "5 minute",
});

const { garbageCollectorMarkAsSeenAndReturnNewEntities } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "15 minutes",
});

const {
  getPagesAndDatabasesToSync,
  createResourcesNotSeenInGarbageCollectionRunBatches,
  completeGarbageCollectionRun,
  clearWorkflowCache,
  getDiscoveredResourcesFromCache,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

const { isFullSyncPendingOrOngoing, logMaxSearchPageIndexReached } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "1 minute",
  });

// This is the garbage collector workflow that continuously runs for each notion connector.
export async function notionGarbageCollectionWorkflow({
  connectorId,
  cursors = {
    pages: { previous: null, last: null },
    databases: { previous: null, last: null },
  },
  pageIndexes = { pages: 0, databases: 0 },
}: {
  connectorId: ModelId;
  cursors?: Record<
    "pages" | "databases",
    { previous: string | null; last: string | null }
  >;
  pageIndexes?: { pages: number; databases: number };
}) {
  const topLevelWorkflowId = workflowInfo().workflowId;

  const res = await isFullSyncPendingOrOngoing({ connectorId });

  if (res) {
    // If we cannot garbage collect (eg, we have never completed a full sync, or there is a full resync in progress)
    // We wait until we can garbage collect (and check every 5 minute).

    await sleep(60_000 * 5); // 5 minutes
    await continueAsNew<typeof notionGarbageCollectionWorkflow>({
      connectorId,
    });

    return;
  }

  // clear the connector cache before each sync
  await clearWorkflowCache({ connectorId, topLevelWorkflowId });

  const runTimestamp = Date.now();

  const childWorkflowQueue = new PQueue({
    concurrency: MAX_CONCURRENT_CHILD_WORKFLOWS,
  });

  const promises: Promise<void>[] = [];

  async function runSearch(
    cursorType: "pages" | "databases"
  ): Promise<{ isComplete: boolean; pageIndex: number }> {
    let pageIndex = pageIndexes[cursorType];
    const { last: lastCursor } = cursors[cursorType];
    if (pageIndex > 0 && !lastCursor) {
      // We are already done
      return {
        isComplete: true,
        pageIndex,
      };
    }
    // we go through each result page of the notion search API
    do {
      // It's a garbage collection, we want to fetch all pages.
      const { pageIds, databaseIds, nextCursor } =
        await getPagesAndDatabasesToSync({
          connectorId,
          lastSyncedAt: null,
          // Only pass non-null cursors.
          cursors: cursors[cursorType],
          excludeUpToDatePages: false,
          loggerArgs: {
            pageIndex,
            runType: "garbageCollection",
          },
          filter: cursorType === "pages" ? "page" : "database",
        });

      // Update the cursors object to keep both the previous and last cursors.
      const newPreviousCursor = cursors[cursorType].last;
      const newLastCursor = nextCursor;
      cursors[cursorType] = {
        previous: newPreviousCursor,
        last: newLastCursor,
      };

      pageIndex += 1;

      // this function triggers child workflows to process batches of pages and databases.
      // the worflow that processes databases will itself trigger child workflows to process
      // batches of child pages.
      promises.push(
        // First mark the page and databases as "seen" in the GC run.
        // The activity returns a potential list of new pages and databases that  we never seen before.
        // We upsert those.
        markAsSeenAndUpsertNewResources({
          connectorId,
          pageIds,
          databaseIds,
          runTimestamp,
          childWorkflowQueue,
          topLevelWorkflowId,
        })
      );

      const batchesPerRun = patched("reduce-gc-batches-per-run")
        ? GC_BATCHES_PER_RUN
        : 512;
      if (pageIndex % batchesPerRun === 0) {
        return { isComplete: false, pageIndex };
      }
      // There are too many search result pages, we're likely in an infinite loop (notion bug).
      if (pageIndex > MAX_SEARCH_PAGE_GARBAGE_COLLECTION_INDEX) {
        // Run activity to log that we had to stop early because we hit the max page index.
        await logMaxSearchPageIndexReached({
          connectorId,
          searchPageIndex: pageIndex,
          maxSearchPageIndex: MAX_SEARCH_PAGE_GARBAGE_COLLECTION_INDEX,
        });
        break;
      }
    } while (cursors[cursorType].last);

    return { isComplete: true, pageIndex };
  }

  const [pagesResult, databasesResult] = await Promise.all([
    runSearch("pages"),
    runSearch("databases"),
  ]);

  const isComplete = pagesResult.isComplete && databasesResult.isComplete;

  if (!isComplete) {
    await Promise.all(promises);
    await continueAsNew<typeof notionGarbageCollectionWorkflow>({
      connectorId,
      cursors,
      pageIndexes: {
        pages: pagesResult.pageIndex,
        databases: databasesResult.pageIndex,
      },
    });
    return;
  }

  // wait for all child workflows to finish
  await Promise.all(promises);

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
      await markAsSeenAndUpsertNewResources({
        connectorId,
        pageIds: discoveredResources.pageIds,
        databaseIds: discoveredResources.databaseIds,
        runTimestamp,
        childWorkflowQueue,
        topLevelWorkflowId,
      });
    }
  } while (discoveredResources && PROCESS_ALL_DISCOVERED_RESOURCES);

  // Look at pages and databases that were not visited in this run, check with the notion API if
  // they were really deleted and delete them from the database if they were.
  // Find the resources not seen in the GC run

  // Create batches of resources to check, by chunk of 100
  const nbOfBatches = await createResourcesNotSeenInGarbageCollectionRunBatches(
    {
      connectorId,
      batchSize: 100,
    }
  );

  // For each chunk, run a garbage collection activity
  const queue = new PQueue({
    concurrency: MAX_PENDING_GARBAGE_COLLECTION_ACTIVITIES,
  });
  const gbPromises: Promise<void>[] = [];
  for (let batchIndex = 0; batchIndex < nbOfBatches; batchIndex++) {
    gbPromises.push(
      queue.add(async () =>
        garbageCollectBatch({
          connectorId,
          runTimestamp,
          batchIndex,
        })
      )
    );
  }

  await Promise.all(gbPromises);

  // Once done, clear all the redis keys used for garbage collection
  await completeGarbageCollectionRun(connectorId, nbOfBatches);

  await sleep(INTERVAL_BETWEEN_GC_SYNCS_MS);

  await continueAsNew<typeof notionGarbageCollectionWorkflow>({
    connectorId,
  });
}

async function markAsSeenAndUpsertNewResources({
  connectorId,
  pageIds,
  databaseIds,
  runTimestamp,
  childWorkflowQueue,
  topLevelWorkflowId,
  childWorkflowsNameSuffix,
}: {
  connectorId: ModelId;
  pageIds: string[];
  databaseIds: string[];
  runTimestamp: number;
  childWorkflowQueue: PQueue;
  topLevelWorkflowId: string;
  childWorkflowsNameSuffix?: string;
}) {
  const { newPageIds, newDatabaseIds } =
    await garbageCollectorMarkAsSeenAndReturnNewEntities({
      connectorId,
      pageIds,
      databaseIds,
      runTimestamp,
    });

  if (!newPageIds.length && !newDatabaseIds.length) {
    return;
  }

  let suffix = "gc";
  if (childWorkflowsNameSuffix) {
    suffix += `-${childWorkflowsNameSuffix}`;
  }

  await performUpserts({
    connectorId,
    pageIds: newPageIds,
    databaseIds: newDatabaseIds,
    runTimestamp,
    pageIndex: null,
    isBatchSync: false,
    queue: childWorkflowQueue,
    childWorkflowsNameSuffix: suffix,
    topLevelWorkflowId,
    forceResync: false,
  });
}
