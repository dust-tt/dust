import { proxyActivities } from "@temporalio/workflow";

import type { CheckActivityResult } from "@app/lib/production_checks/types";
import type * as activities from "@app/temporal/production_checks/activities";

const { runAllChecksActivity, runSingleCheckActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "1 hour",
  heartbeatTimeout: "10 minutes",
});

export async function runAllChecksWorkflow(): Promise<CheckActivityResult[]> {
  return runAllChecksActivity();
}

export async function runSingleCheckWorkflow(
  checkName: string
): Promise<CheckActivityResult> {
  return runSingleCheckActivity(checkName);
}
