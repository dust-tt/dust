import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/upsert_tables/activities";

const { upsertTableActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "20 minutes",
});

export async function upsertTableWorkflow(
  upsertQueueId: string,
  enqueueTimestamp: number
) {
  await upsertTableActivity(upsertQueueId, enqueueTimestamp);
}
