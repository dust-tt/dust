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

const { notionUpsertPageActivity, notionGetPagesToSyncActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "10 minute",
  });

const {
  saveSuccessSyncActivity,
  saveStartSyncActivity,
  getNotionAccessTokenActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

// soft limit on the number of iterations of the loop that should be ran in a single workflow
// before "continuing as new" to avoid hitting the workflow log size limit
const MAX_ITERATIONS_PER_WORKFLOW = 50;

// Notion's "last edited" timestamp is precise to the minute
const SYNC_PERIOD_DURATION_MS = 60_000;

// How long to wait before checking for new pages again
const INTERVAL_BETWEEN_SYNCS_MS = 10_000;

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

  let pagesSyncedWithinPeriod: Set<string> = new Set();

  setHandler(getLastSyncPeriodTsQuery, () => lastSyncedPeriodTs);

  const notionAccessToken = await getNotionAccessTokenActivity(
    nangoConnectionId
  );

  const isInitialSync = !lastSyncedPeriodTs;

  do {
    await saveStartSyncActivity(dataSourceConfig);
    const runTimestamp = preProcessTimestampForNotion(Date.now());

    if (runTimestamp !== lastSyncedPeriodTs) {
      pagesSyncedWithinPeriod = new Set();
    }

    let cursor: string | null = null;
    let pageIndex = 0;
    const childWorkflowQueue = new PQueue({
      concurrency: MAX_CONCURRENT_CHILD_WORKFLOWS,
    });
    const promises: Promise<void>[] = [];

    do {
      const { pageIds, nextCursor } = await notionGetPagesToSyncActivity(
        notionAccessToken,
        lastSyncedPeriodTs,
        cursor,
        {
          pageIndex,
          dataSourceName: dataSourceConfig.dataSourceName,
          workspaceId: dataSourceConfig.workspaceId,
        }
      );
      cursor = nextCursor;
      pageIndex += 1;

      const pagesToSync = pageIds.filter(
        (pageId) => !pagesSyncedWithinPeriod.has(pageId)
      );
      if (!pagesToSync.length) {
        continue;
      }
      if (lastSyncedPeriodTs) {
        pagesToSync.forEach((pageId) => pagesSyncedWithinPeriod.add(pageId));
      }

      for (
        let i = 0;
        i < pagesToSync.length;
        i += MAX_PAGE_IDS_PER_CHILD_WORKFLOW
      ) {
        const batch = pagesToSync.slice(i, i + MAX_PAGE_IDS_PER_CHILD_WORKFLOW);
        const workflowId = `${getWorkflowId(
          dataSourceConfig
        )}-result-page-${pageIndex}-${i}`;
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

    await Promise.all(promises);
    await saveSuccessSyncActivity(dataSourceConfig);
    lastSyncedPeriodTs = runTimestamp;
    iterations += 1;

    await sleep(INTERVAL_BETWEEN_SYNCS_MS);
  } while (
    !isInitialSync &&
    (iterations < MAX_ITERATIONS_PER_WORKFLOW || pagesSyncedWithinPeriod.size)
  );

  await continueAsNew<typeof notionSyncWorkflow>(
    dataSourceConfig,
    nangoConnectionId,
    lastSyncedPeriodTs
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
