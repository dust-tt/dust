import {
  continueAsNew,
  defineQuery,
  proxyActivities,
  setHandler,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/notion/temporal/activities";
import { DataSourceConfig } from "@connectors/types/data_source_config";

const { notionGetPagesToSyncActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});
const { notionUpsertPageActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minute",
});
const { saveSuccessSyncActivity, saveStartSyncActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "1 minute",
});
const { getNotionAccessTokenActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

// soft limit on the number of iterations of the loop that should be ran in a single workflow
// before "continuing as new" to avoid hitting the workflow log size limit
const MAX_ITERATIONS_PER_WORKFLOW = 50;

// Notion's "last edited" timestamp is precise to the minute
const SYNC_PERIOD_DURATION_MS = 60_000;
// How often to check for new pages to sync
const INTERVAL_BETWEEN_SYNCS_MS = 10_000;

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

    const pagesToSync = (
      await notionGetPagesToSyncActivity(notionAccessToken, lastSyncedPeriodTs)
    ).filter((p) => !pagesSyncedWithinPeriod.has(p));

    pagesToSync.forEach((p) => pagesSyncedWithinPeriod.add(p));

    await Promise.all(
      pagesToSync.map((p) =>
        notionUpsertPageActivity(notionAccessToken, p, dataSourceConfig)
      )
    );

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
