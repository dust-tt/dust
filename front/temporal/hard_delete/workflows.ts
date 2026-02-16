import type * as activities from "@app/temporal/hard_delete/activities";
import { proxyActivities } from "@temporalio/workflow";

// TODO(2024-06-13 flav) Lower `startToCloseTimeout` to 10 minutes.
const { purgeExpiredRunExecutionsActivity, purgeExpiredPendingAgentsActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "60 minutes",
  });

export async function purgeRunExecutionsCronWorkflow(): Promise<void> {
  await purgeExpiredRunExecutionsActivity();
  await purgeExpiredPendingAgentsActivity();
}
