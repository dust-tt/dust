import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/production_checks/activities";

const { runAllChecksActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 hour",
  heartbeatTimeout: "5 minutes",
});

export async function runAllChecksWorkflow() {
  await runAllChecksActivity();
}
