import {
  continueAsNew,
  defineQuery,
  proxyActivities,
  setHandler,
  sleep,
} from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/notion/temporal/activities";
import { DataSourceConfig } from "@connectors/types/data_source_config";

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

const MAX_PENDING_UPSERT_ACTIVITIES = 3;
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

  do {
    await saveStartSyncActivity(dataSourceConfig);
    const nextSyncedPeriodTs = preProcessTimestampForNotion(Date.now());
    if (nextSyncedPeriodTs !== lastSyncedPeriodTs) {
      pagesSyncedWithinPeriod = new Set();
    }

    let cursor: string | null = null;
    let pageIndex = 0;
    const upsertQueue = new PQueue({
      concurrency: MAX_PENDING_UPSERT_ACTIVITIES,
    });
    const dbQueue = new PQueue({
      concurrency: MAX_PENDING_DB_ACTIVITIES,
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

      for (const pageId of pageIds) {
        if (pagesSyncedWithinPeriod.has(pageId)) {
          continue;
        }

        promises.push(
          dbQueue.add(() =>
            registerPageSeenActivity(
              dataSourceConfig,
              pageId,
              nextSyncedPeriodTs
            )
          )
        );

        promises.push(
          upsertQueue.add(() =>
            notionUpsertPageActivity(
              notionAccessToken,
              pageId,
              dataSourceConfig
            )
          )
        );

        if (lastSyncedPeriodTs) {
          pagesSyncedWithinPeriod.add(pageId);
        }
      }
    } while (cursor);

    await Promise.all(promises);
    await saveSuccessSyncActivity(dataSourceConfig);
    lastSyncedPeriodTs = nextSyncedPeriodTs;
    iterations += 1;

    await sleep(INTERVAL_BETWEEN_SYNCS_MS);
  } while (
    iterations < MAX_ITERATIONS_PER_WORKFLOW ||
    pagesSyncedWithinPeriod.size
  );

  await continueAsNew<typeof notionSyncWorkflow>(
    dataSourceConfig,
    nangoConnectionId,
    lastSyncedPeriodTs
  );
}
