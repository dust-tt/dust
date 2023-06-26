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

const { notionUpsertPageActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minute",
});

const { notionGetPagesToSyncActivity, syncGarbageCollectorPagesActivity } =
  proxyActivities<typeof activities>({
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
const MAX_ITERATIONS_PER_WORKFLOW = 50;

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
  nangoConnectionId: string,
  startFromTs?: number
) {
  let iterations = 0;

  let lastSyncedPeriodTs: number | null = startFromTs
    ? preProcessTimestampForNotion(startFromTs)
    : null;

  setHandler(getLastSyncPeriodTsQuery, () => lastSyncedPeriodTs);

  const { notionAccessToken, shouldGargageCollect: isGargageCollectionRun } =
    await getInitialWorkflowParamsActivity(dataSourceConfig, nangoConnectionId);

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

    do {
      const { pageIds, nextCursor } = await notionGetPagesToSyncActivity(
        dataSourceConfig,
        notionAccessToken,
        // if we're doing a garbage collection run, we want to fetch all pages
        !isGargageCollectionRun ? lastSyncedPeriodTs : null,
        cursor,
        // if not in a garbage collection run, we don't  want to sync pages
        // that are already up to date
        !isGargageCollectionRun,
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

      if (isGargageCollectionRun) {
        // mark pages as visited to avoid deleting them and return
        // pages that are new
        pagesToSync = await syncGarbageCollectorPagesActivity(
          dataSourceConfig,
          pageIds,
          runTimestamp
        );
      } else {
        pagesToSync = pageIds;
      }

      if (!pagesToSync.length) {
        continue;
      }

      for (
        let i = 0;
        i < pagesToSync.length;
        i += MAX_PAGE_IDS_PER_CHILD_WORKFLOW
      ) {
        const batch = pagesToSync.slice(i, i + MAX_PAGE_IDS_PER_CHILD_WORKFLOW);
        const batchIndex = Math.floor(i / MAX_PAGE_IDS_PER_CHILD_WORKFLOW);
        const workflowId = `${getWorkflowId(
          dataSourceConfig
        )}-result-page-${pageIndex}-${batchIndex}${
          isGargageCollectionRun ? "-gc" : ""
        }`;
        promises.push(
          childWorkflowQueue.add(() =>
            executeChild(notionSyncResultPageWorkflow.name, {
              workflowId,
              args: [dataSourceConfig, notionAccessToken, batch, runTimestamp],
              parentClosePolicy:
                ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
            })
          )
        );
      }
    } while (cursor);

    // wait for all child workflows to finish
    await Promise.all(promises);

    if (!isGargageCollectionRun) {
      await saveSuccessSyncActivity(dataSourceConfig);
      lastSyncedPeriodTs = preProcessTimestampForNotion(runTimestamp);
    } else {
      // look at pages that were not visited in this run, check with the notion API
      // if they were really deleted and delete them from the database if they were
      await garbageCollectActivity(dataSourceConfig, runTimestamp);
    }

    iterations += 1;
    await sleep(INTERVAL_BETWEEN_SYNCS_MS);
  } while (
    !isInitialSync &&
    !isGargageCollectionRun &&
    iterations < MAX_ITERATIONS_PER_WORKFLOW
  );

  await continueAsNew<typeof notionSyncWorkflow>(
    dataSourceConfig,
    nangoConnectionId,
    // cannot actually be undefined, but TS doesn't know that
    lastSyncedPeriodTs ?? undefined
  );
}

export async function notionSyncResultPageWorkflow(
  dataSourceConfig: DataSourceConfig,
  notionAccessToken: string,
  pageIds: string[],
  runTimestamp: number
) {
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
          loggerArgs
        )
      )
    );
  }

  await Promise.all(promises);
}
