import { continueAsNew, proxyActivities, sleep } from "@temporalio/workflow";
import { defineSignal, workflowInfo } from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/notion/temporal/activities";
import { MAX_CONCURRENT_CHILD_WORKFLOWS } from "@connectors/connectors/notion/temporal/config";
import { upsertDatabaseInCore } from "@connectors/connectors/notion/temporal/workflows/upserts";
import type { ModelId } from "@connectors/types";

export type UpsertDatabaseQueueSignal = {
  databaseId: string;
};

export const upsertDatabaseQueueSignal = defineSignal<
  UpsertDatabaseQueueSignal[]
>("upsertDatabaseQueueSignal");

const { isFullSyncPendingOrOngoing } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

const { getNextDatabaseToUpsert, clearWorkflowCache } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "10 minute",
});

// This is a top level workflow, meant to run continuously.
// It fetches the next database to upsert, based on the last
// upserted timestamp, or the last requested upsert timestamp.
// It allows debouncing multiple requests to upsert the same database.
export async function processDatabaseUpsertQueueWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const res = await isFullSyncPendingOrOngoing({
    connectorId,
  });
  if (res) {
    // Wait until the full sync is complete before we start processing the queue of
    // databases to upsert.
    // This allows to avoid processing child pages of databases that are already
    // found by the full sync via the notion `search` endpoint.

    await sleep(60_000 * 5); // 5 minutes
    await continueAsNew<typeof processDatabaseUpsertQueueWorkflow>({
      connectorId,
    });
  }

  const notionDatabaseId = await getNextDatabaseToUpsert({
    connectorId,
  });

  if (notionDatabaseId) {
    // Clear the workflow cache before processing
    await clearWorkflowCache({
      connectorId,
      topLevelWorkflowId: workflowInfo().workflowId,
    });

    // We either haven't processed the DB recently, or we have no trace of ever processing it.
    await upsertDatabaseInCore({
      connectorId,
      databaseId: notionDatabaseId,
      runTimestamp: Date.now(),
      topLevelWorkflowId: workflowInfo().workflowId,
      queue: new PQueue({
        concurrency: MAX_CONCURRENT_CHILD_WORKFLOWS,
      }),
      forceResync: false,
    });
  } else {
    await sleep("5 minutes");
  }

  await continueAsNew<typeof processDatabaseUpsertQueueWorkflow>({
    connectorId,
  });
}
