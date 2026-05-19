import type * as activities from "@app/temporal/upsert_queue/activities";
import { proxyActivities } from "@temporalio/workflow";

const { upsertDocumentActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function upsertDocumentWorkflow(
  upsertQueueId: string,
  enqueueTimestamp: number
) {
  await upsertDocumentActivity(upsertQueueId, enqueueTimestamp);
}
