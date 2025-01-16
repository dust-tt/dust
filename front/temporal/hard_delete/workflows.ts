import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/hard_delete/activities";

// TODO(2024-06-13 flav) Lower `startToCloseTimeout` to 10 minutes.
const { purgeExpiredRunExecutionsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "60 minutes",
});

export async function purgeRunExecutionsCronWorkflow(): Promise<void> {
  await purgeExpiredRunExecutionsActivity();
}
