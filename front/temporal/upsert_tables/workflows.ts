import type * as activities from "@app/temporal/upsert_tables/activities";
import { proxyActivities } from "@temporalio/workflow";

const { upsertTableActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "20 minutes",
});

export async function upsertTableWorkflow(
  upsertQueueId: string,
  enqueueTimestamp: number
) {
  await upsertTableActivity(upsertQueueId, enqueueTimestamp);
}
