import type * as activities from "@app/temporal/production_checks/activities";
import type { CheckActivityResult } from "@app/types/production_checks";
import { proxyActivities } from "@temporalio/workflow";

const { runAllChecksActivity, runSingleCheckActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "1 hour",
  heartbeatTimeout: "10 minutes",
});

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function runAllChecksWorkflow(): Promise<CheckActivityResult[]> {
  return runAllChecksActivity();
}

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function runSingleCheckWorkflow(
  checkName: string
): Promise<CheckActivityResult> {
  return runSingleCheckActivity(checkName);
}
