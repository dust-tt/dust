import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/upsert_queue/temporal/activities";

const { upsertDocumentActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function upsertDocumentWorkflow(upsertQueueId: string) {
  await upsertDocumentActivity(upsertQueueId);
}
