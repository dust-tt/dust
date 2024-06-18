import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/upsert_queue/activities";

const { upsertDocumentActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

const { upsertTableActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "20 minutes",
});

export async function upsertDocumentWorkflow(
  upsertQueueId: string,
  enqueueTimestamp: number
) {
  await upsertDocumentActivity(upsertQueueId, enqueueTimestamp);
}

export async function upsertTableWorkflow(
  upsertQueueId: string,
  enqueueTimestamp: number
) {
  await upsertTableActivity(upsertQueueId, enqueueTimestamp);
}
