import { proxyActivities, sleep } from "@temporalio/workflow";

import type * as activities from "@app/temporal/usage_queue/activities";

const { recordUsageActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function updateWorkspaceUsageWorkflow(workspaceId: string) {
  // Sleep for one hour before computing usage.
  await sleep(60 * 60 * 1000);

  await recordUsageActivity(workspaceId);
}
