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
import { UpsertActivityResult } from "@connectors/connectors/notion/temporal/activities";
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
    const promises: Promise<UpsertActivityResult[]>[] = [];

    do {
      const { pageIds, databaseIds, nextCursor } =
        await notionGetToSyncActivity(
          dataSourceConfig,
          notionAccessToken,
          // If we're doing a garbage collection run, we want to fetch all pages otherwise, we only
          // want to fetch pages that were updated since the last sync.
          !isGargageCollectionRun ? lastSyncedPeriodTs : null,
          cursor,
          // We only want to fetch pages that were updated since the last sync unless it's a garbage
          // collection run or a force resync.
          !isGargageCollectionRun && !forceResync,
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

      let pagesToSync: string[] = [];
      let databasesToSync: string[] = [];

      if (isGargageCollectionRun) {
        // Mark pages and databases as visited to avoid deleting them and return pages and databases
        // that are new.
        const { newPageIds, newDatabaseIds } =
          await syncGarbageCollectorActivity(
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
        continue;
      }

      if (pagesToSync.length) {
        for (
          let i = 0;
          i < pagesToSync.length;
          i += MAX_PAGE_IDS_PER_CHILD_WORKFLOW
        ) {
          const batch = pagesToSync.slice(
            i,
            i + MAX_PAGE_IDS_PER_CHILD_WORKFLOW
          );
          const batchIndex = Math.floor(i / MAX_PAGE_IDS_PER_CHILD_WORKFLOW);
          const workflowId = `${getWorkflowId(
            dataSourceConfig
          )}-result-page-${pageIndex}-pages-${batchIndex}${
            isGargageCollectionRun ? "-gc" : ""
          }`;
          promises.push(
            childWorkflowQueue.add(() =>
              executeChild(notionSyncResultPageWorkflow, {
                workflowId,
                args: [
                  dataSourceConfig,
                  notionAccessToken,
                  batch,
                  runTimestamp,
                  isInitialSync || forceResync || isGargageCollectionRun,
                ],
                parentClosePolicy:
                  ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
              })
            ) as Promise<UpsertActivityResult[]>
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
          const workflowId = `${getWorkflowId(
            dataSourceConfig
          )}-result-page-${pageIndex}-databases-${batchIndex}${
            isGargageCollectionRun ? "-gc" : ""
          }`;
          promises.push(
            childWorkflowQueue.add(() =>
              executeChild(notionSyncResultPageDatabaseWorkflow, {
                workflowId,
                args: [
                  dataSourceConfig,
                  notionAccessToken,
                  batch,
                  runTimestamp,
                ],
                parentClosePolicy:
                  ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
              })
            ) as Promise<UpsertActivityResult[]>
          );
        }
      }
    } while (cursor);

    // wait for all child workflows to finish
    const syncWorkflowResults = await Promise.all(promises);

    await updateParentsFieldsActivity(
      dataSourceConfig,
      syncWorkflowResults.flat()
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
): Promise<UpsertActivityResult[]> {
  const upsertQueue = new PQueue({
    concurrency: MAX_PENDING_UPSERT_ACTIVITIES,
  });

  const promises: Promise<UpsertActivityResult>[] = [];

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
      ) as Promise<UpsertActivityResult>
    );
  }

  return await Promise.all(promises);
}

export async function notionSyncResultPageDatabaseWorkflow(
  dataSourceConfig: DataSourceConfig,
  notionAccessToken: string,
  databaseIds: string[],
  runTimestamp: number
): Promise<UpsertActivityResult[]> {
  const upsertQueue = new PQueue({
    concurrency: MAX_PENDING_UPSERT_ACTIVITIES,
  });

  const promises: Promise<UpsertActivityResult>[] = [];

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
      ) as Promise<UpsertActivityResult>
    );
  }
  return await Promise.all(promises);
}
