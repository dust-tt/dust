import type * as activities from "@app/temporal/upsert_queue/activities";
import { proxyActivities } from "@temporalio/workflow";

const MAX_UPSERT_TABLE_ATTEMPTS = 10;

const { upsertDocumentActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function upsertDocumentWorkflow(
  upsertQueueId: string,
  enqueueTimestamp: number
) {
  await upsertDocumentActivity(upsertQueueId, enqueueTimestamp);
}
