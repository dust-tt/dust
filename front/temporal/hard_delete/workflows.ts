import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/hard_delete/activities";

const { purgeExpiredRunExecutions } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minutes",
});

export async function purgeRunExecutionsCronWorkflow(): Promise<void> {
  await purgeExpiredRunExecutions();
}
