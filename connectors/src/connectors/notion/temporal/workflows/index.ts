import {
  continueAsNew,
  defineQuery,
  executeChild,
  proxyActivities,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/notion/temporal/activities";
import {
  INTERVAL_BETWEEN_SYNCS_MS,
  MAX_CONCURRENT_CHILD_WORKFLOWS,
  MAX_SEARCH_PAGE_INDEX,
  PROCESS_ALL_DISCOVERED_RESOURCES,
  SYNC_PERIOD_DURATION_MS,
} from "@connectors/connectors/notion/temporal/config";
import { performUpserts } from "@connectors/connectors/notion/temporal/workflows/upserts";
import type { ModelId } from "@connectors/types";

// re-export all the workflows to make temporal happy
export * from "./admins";
export * from "./check_resources_accessibility";
export * from "./children";
export * from "./garbage_collection";
export * from "./upsert_database_queue";

export const UPDATE_PARENTS_FIELDS_TIMEOUT_MINUTES = 400;
const { updateParentsFields } = proxyActivities<typeof activities>({
  startToCloseTimeout: `${UPDATE_PARENTS_FIELDS_TIMEOUT_MINUTES} minutes`,
  heartbeatTimeout: "10 minute",
});

const {
  getPagesAndDatabasesToSync,
  clearWorkflowCache,
  getDiscoveredResourcesFromCache,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

const { drainDocumentUpsertQueue } = proxyActivities<typeof activities>({
  startToCloseTimeout: "20 seconds",
});

const {
  saveSuccessSync,
  saveStartSync,
  logMaxSearchPageIndexReached,
  markParentsAsUpdated,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

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
}: {
  connectorId: ModelId;
  startFromTs: number | null;
  forceResync: boolean;
}) {
  const topLevelWorkflowId = workflowInfo().workflowId;

  let lastSyncedPeriodTs: number | null = startFromTs
    ? preProcessTimestampForNotion(startFromTs)
    : null;

  const isInitialSync = !lastSyncedPeriodTs;

  await saveStartSync(connectorId);

  // clear the connector cache before each sync
  await clearWorkflowCache({ connectorId, topLevelWorkflowId });

  const runTimestamp = Date.now();

  const cursors: Record<
    "pages" | "databases",
    { previous: string | null; last: string | null }
  > = {
    pages: {
      previous: null,
      last: null,
    },
    databases: {
      previous: null,
      last: null,
    },
  };
  let pageIndex = 0;
  const childWorkflowQueue = new PQueue({
    concurrency: MAX_CONCURRENT_CHILD_WORKFLOWS,
  });

  const promises: Promise<void>[] = [];

  // We only want to fetch pages that were updated since the last sync unless it's a a force resync.
  const skipUpToDatePages = !forceResync;

  async function runSearch(cursorType: "pages" | "databases") {
    do {
      const { pageIds, databaseIds, nextCursor } =
        await getPagesAndDatabasesToSync({
          connectorId,
          // If we're doing a garbage collection run, we want to fetch all pages otherwise, we only
          // want to fetch pages that were updated since the last sync.
          lastSyncedAt: lastSyncedPeriodTs,
          // Only pass non-null cursors.
          cursors: cursors[cursorType],
          excludeUpToDatePages: skipUpToDatePages,
          loggerArgs: {
            pageIndex,
            runType: isInitialSync ? "initialSync" : "incrementalSync",
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
        performUpserts({
          connectorId,
          pageIds,
          databaseIds,
          runTimestamp,
          pageIndex,
          isBatchSync: isInitialSync,
          queue: childWorkflowQueue,
          topLevelWorkflowId,
          forceResync,
        })
      );

      // There are too many search result pages, we're likely in an infinite loop (notion bug).
      if (pageIndex > MAX_SEARCH_PAGE_INDEX) {
        // Run activity to log that we had to stop early because we hit the max page index.
        await logMaxSearchPageIndexReached({
          connectorId,
          searchPageIndex: pageIndex,
          maxSearchPageIndex: MAX_SEARCH_PAGE_INDEX,
        });
        break;
      }
    } while (cursors[cursorType].last);
  }

  // we go through each result page of the notion search API, both for pages and databases
  await Promise.all([runSearch("pages"), runSearch("databases")]);

  // wait for all child workflows to finish
  await Promise.all(promises);

  if (isInitialSync) {
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

  // Drain the upsert queue before updating parents to ensure all document upserts are complete
  await executeChild(notionDrainDocumentUpsertQueueWorkflow, {
    workflowId: `${topLevelWorkflowId}-drain-upsert-queue`,
    args: [{ connectorId }],
  });

  // Compute parents after all documents are added/updated
  await executeChild(notionUpdateAllParentsFieldsWorkflow, {
    workflowId: `${topLevelWorkflowId}-update-parents-fields`,
    args: [{ connectorId }],
  });

  await saveSuccessSync(connectorId);
  lastSyncedPeriodTs = preProcessTimestampForNotion(runTimestamp);

  await sleep(INTERVAL_BETWEEN_SYNCS_MS);

  await continueAsNew<typeof notionSyncWorkflow>({
    connectorId,
    startFromTs: lastSyncedPeriodTs,
    forceResync: false,
  });
}

export async function notionDrainDocumentUpsertQueueWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const startTime = Date.now();
  const timeoutMs = 60 * 60 * 1000; // 1 hour

  // This sleep is to ensure that any activities that were just scheduled have time to start before our first check
  await sleep(1000);

  while (Date.now() - startTime < timeoutMs) {
    // Call the activity which polls up to 5 times (5 seconds max)
    const isDrained = await drainDocumentUpsertQueue({ connectorId });

    if (isDrained) {
      return;
    }

    // Queue not yet drained, sleep for 5 seconds before trying again
    await sleep(5000);
  }

  throw new Error(
    `Timeout (1 hour) waiting for upsert queue to drain for connector ${connectorId}`
  );
}

export async function notionUpdateAllParentsFieldsWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const runTimestamp = Date.now();
  let cursors:
    | {
        pageCursor: string | null;
        databaseCursor: string | null;
      }
    | undefined;
  do {
    cursors = await updateParentsFields({
      connectorId,
      cursors,
      runTimestamp,
    });
  } while (cursors?.pageCursor || cursors?.databaseCursor);
  await markParentsAsUpdated({ connectorId, runTimestamp });
}
