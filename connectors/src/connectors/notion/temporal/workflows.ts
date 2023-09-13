import {
  continueAsNew,
  defineQuery,
  executeChild,
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  sleep,
} from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/notion/temporal/activities";
import { DataSourceConfig } from "@connectors/types/data_source_config";

import { getWorkflowId } from "./utils";

const { garbageCollectActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "120 minute",
});

const { notionUpsertPageActivity, notionUpsertDatabaseActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "60 minute",
  });

const {
  notionGetToSyncActivity,
  syncGarbageCollectorActivity,
  updateParentsFieldsActivity,
  getDatabaseChildPagesActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

const {
  saveSuccessSyncActivity,
  saveStartSyncActivity,
  getInitialWorkflowParamsActivity,
} = proxyActivities<typeof activities>({
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

export async function notionSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  startFromTs?: number,
  forceResync = false
) {
  let iterations = 0;

  let lastSyncedPeriodTs: number | null = startFromTs
    ? preProcessTimestampForNotion(startFromTs)
    : null;

  setHandler(getLastSyncPeriodTsQuery, () => lastSyncedPeriodTs);

  const { notionAccessToken, shouldGargageCollect: isGargageCollectionRun } =
    await getInitialWorkflowParamsActivity(dataSourceConfig);

  const isInitialSync = !lastSyncedPeriodTs;

  do {
    if (!isGargageCollectionRun) {
      await saveStartSyncActivity(dataSourceConfig);
    }

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
      const skipUpToDatePages = !isGargageCollectionRun && !forceResync;

      const { pageIds, databaseIds, nextCursor } =
        await notionGetToSyncActivity(
          dataSourceConfig,
          notionAccessToken,
          // If we're doing a garbage collection run, we want to fetch all pages otherwise, we only
          // want to fetch pages that were updated since the last sync.
          !isGargageCollectionRun ? lastSyncedPeriodTs : null,
          cursor,
          skipUpToDatePages,
          // Logger args:
          {
            pageIndex,
            runType: isGargageCollectionRun
              ? "garbageCollection"
              : isInitialSync
              ? "initialSync"
              : "incrementalSync",
          }
        );
      cursor = nextCursor;
      pageIndex += 1;

      // this function triggers child workflows to process batches of pages and databases.
      // the worflow that processes databases will itself trigger child workflows to process
      // batches of child pages.
      promises.push(
        performUpserts({
          dataSourceConfig,
          notionAccessToken,
          pageIds,
          databaseIds,
          isGarbageCollectionRun: isGargageCollectionRun,
          runTimestamp,
          pageIndex,
          isBatchSync: isInitialSync,
          skipUpToDatePages,
          queue: childWorkflowQueue,
        })
      );
    } while (cursor);

    // wait for all child workflows to finish
    await Promise.all(promises);

    await updateParentsFieldsActivity(
      dataSourceConfig,
      runTimestamp,
      new Date().getTime()
    );

    if (!isGargageCollectionRun) {
      await saveSuccessSyncActivity(dataSourceConfig);
      lastSyncedPeriodTs = preProcessTimestampForNotion(runTimestamp);
    } else {
      // Look at pages and databases that were not visited in this run, check with the notion API if
      // they were really deleted and delete them from the database if they were.
      await garbageCollectActivity(
        dataSourceConfig,
        runTimestamp,
        new Date().getTime()
      );
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
    !isGargageCollectionRun &&
    iterations < MAX_ITERATIONS_PER_WORKFLOW
  );

  await continueAsNew<typeof notionSyncWorkflow>(
    dataSourceConfig,
    // Cannot actually be undefined, but TS doesn't know that.
    lastSyncedPeriodTs ?? undefined
  );
}

export async function notionSyncResultPageWorkflow(
  dataSourceConfig: DataSourceConfig,
  notionAccessToken: string,
  pageIds: string[],
  runTimestamp: number,
  isBatchSync = false
): Promise<void> {
  const upsertQueue = new PQueue({
    concurrency: MAX_PENDING_UPSERT_ACTIVITIES,
  });

  const promises: Promise<void>[] = [];

  for (const [pageIndex, pageId] of pageIds.entries()) {
    const loggerArgs = {
      dataSourceName: dataSourceConfig.dataSourceName,
      workspaceId: dataSourceConfig.workspaceId,
      pageIndex,
    };
    promises.push(
      upsertQueue.add(() =>
        notionUpsertPageActivity(
          notionAccessToken,
          pageId,
          dataSourceConfig,
          runTimestamp,
          loggerArgs,
          isBatchSync
        )
      )
    );
  }

  await Promise.all(promises);
}

export async function notionSyncResultPageDatabaseWorkflow(
  dataSourceConfig: DataSourceConfig,
  notionAccessToken: string,
  databaseIds: string[],
  runTimestamp: number,
  isGarbageCollectionRun = false,
  isBatchSync = false
): Promise<void> {
  const upsertQueue = new PQueue({
    concurrency: MAX_PENDING_UPSERT_ACTIVITIES,
  });
  const workflowQueue = new PQueue({
    concurrency: MAX_CONCURRENT_CHILD_WORKFLOWS,
  });

  let promises: Promise<void>[] = [];

  for (const [databaseIndex, databaseId] of databaseIds.entries()) {
    const loggerArgs = {
      dataSourceName: dataSourceConfig.dataSourceName,
      workspaceId: dataSourceConfig.workspaceId,
      databaseIndex,
    };

    promises.push(
      upsertQueue.add(() =>
        notionUpsertDatabaseActivity(
          notionAccessToken,
          databaseId,
          dataSourceConfig,
          runTimestamp,
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
    let cursor: string | null = null;
    let pageIndex = 0;
    const loggerArgs = {
      dataSourceName: dataSourceConfig.dataSourceName,
      workspaceId: dataSourceConfig.workspaceId,
    };
    do {
      const { pageIds, nextCursor } = await getDatabaseChildPagesActivity({
        dataSourceInfo: dataSourceConfig,
        databaseId,
        accessToken: notionAccessToken,
        cursor,
        loggerArgs: {
          ...loggerArgs,
          pageIndex,
        },
        // Note: we don't want to optimize this step due to Notion not always returning all the
        // dbs (so if we miss it at initial sync and it gets touched we will miss all its old
        // pages here again. It's a lot of additional work but it helps catching as much as we
        // can from Notion). The caller of this function filters the edited page based on our
        // knowledge of it in DB so this won't create extraneous upserts.
        excludeUpToDatePages: false,
      });
      cursor = nextCursor;
      pageIndex += 1;
      const upsertsPromise = performUpserts({
        dataSourceConfig,
        notionAccessToken,
        pageIds,
        databaseIds: [], // we don't upsert any databases in this workflow
        isGarbageCollectionRun,
        runTimestamp,
        pageIndex,
        isBatchSync,
        skipUpToDatePages: false,
        queue: workflowQueue,
        childWorkflowsNameSuffix: `database-children-${databaseId}`,
      });

      promises.push(upsertsPromise);
    } while (cursor);
  }

  await Promise.all(promises);
}

async function performUpserts({
  dataSourceConfig,
  notionAccessToken,
  pageIds,
  databaseIds,
  isGarbageCollectionRun,
  runTimestamp,
  pageIndex,
  isBatchSync,
  skipUpToDatePages,
  queue,
  childWorkflowsNameSuffix = "",
}: {
  dataSourceConfig: DataSourceConfig;
  notionAccessToken: string;
  pageIds: string[];
  databaseIds: string[];
  isGarbageCollectionRun: boolean;
  runTimestamp: number;
  pageIndex: number;
  isBatchSync: boolean;
  skipUpToDatePages: boolean;
  queue: PQueue;
  childWorkflowsNameSuffix?: string;
}): Promise<void> {
  let pagesToSync: string[] = [];
  let databasesToSync: string[] = [];

  const promises: Promise<void>[] = [];

  if (isGarbageCollectionRun) {
    // Mark pages and databases as visited to avoid deleting them and return pages and databases
    // that are new.
    const { newPageIds, newDatabaseIds } = await syncGarbageCollectorActivity(
      dataSourceConfig,
      pageIds,
      databaseIds,
      runTimestamp
    );
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
      let workflowId = `${getWorkflowId(
        dataSourceConfig
      )}-result-page-${pageIndex}-pages-${batchIndex}`;
      if (isGarbageCollectionRun) {
        workflowId += "-gc";
      }
      if (childWorkflowsNameSuffix) {
        workflowId += `-${childWorkflowsNameSuffix}`;
      }

      promises.push(
        queue.add(() =>
          executeChild(notionSyncResultPageWorkflow, {
            workflowId,
            args: [
              dataSourceConfig,
              notionAccessToken,
              batch,
              runTimestamp,
              isBatchSync,
            ],
            parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
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
      let workflowId = `${getWorkflowId(
        dataSourceConfig
      )}-result-page-${pageIndex}-databases-${batchIndex}`;
      if (isGarbageCollectionRun) {
        workflowId += "-gc";
      }
      if (childWorkflowsNameSuffix) {
        workflowId += `-${childWorkflowsNameSuffix}`;
      }

      promises.push(
        queue.add(() =>
          executeChild(notionSyncResultPageDatabaseWorkflow, {
            workflowId,
            args: [
              dataSourceConfig,
              notionAccessToken,
              batch,
              runTimestamp,
              isGarbageCollectionRun,
              isBatchSync,
            ],
            parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
          })
        )
      );
    }
  }

  await Promise.all(promises);
}
