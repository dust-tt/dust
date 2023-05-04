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
    startToCloseTimeout: "5 minute",
  });

const {
  saveSuccessSyncActivity,
  saveStartSyncActivity,
  getNotionAccessTokenActivity,
  registerPageSeenActivity,
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
const MAX_PENDING_UPSERT_ACTIVITIES = 5;
const MAX_PENDING_DB_ACTIVITIES = 10;

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
    const nextSyncedPeriodTs = preProcessTimestampForNotion(Date.now());
    if (nextSyncedPeriodTs !== lastSyncedPeriodTs) {
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

      const workflowId = `${getWorkflowId(
        dataSourceConfig
      )}-result-page-${pageIndex}`;
      promises.push(
        childWorkflowQueue.add(() =>
          executeChild(notionSyncResultPageWorkflow.name, {
            workflowId,
            args: [
              dataSourceConfig,
              notionAccessToken,
              pagesToSync,
              nextSyncedPeriodTs,
            ],
            parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
          })
        )
      );
    } while (cursor);

    await Promise.all(promises);
    await saveSuccessSyncActivity(dataSourceConfig);
    lastSyncedPeriodTs = nextSyncedPeriodTs;
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
  nextSyncedPeriodTs: number
) {
  const upsertQueue = new PQueue({
    concurrency: MAX_PENDING_UPSERT_ACTIVITIES,
  });
  const dbQueue = new PQueue({
    concurrency: MAX_PENDING_DB_ACTIVITIES,
  });

  const promises: Promise<void>[] = [];

  for (const [pageIndex, pageId] of pageIds.entries()) {
    promises.push(
      dbQueue.add(() =>
        registerPageSeenActivity(dataSourceConfig, pageId, nextSyncedPeriodTs)
      )
    );

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
          loggerArgs
        )
      )
    );
  }

  await Promise.all(promises);
}
