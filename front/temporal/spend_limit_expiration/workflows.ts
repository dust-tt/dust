import type * as activities from "@app/temporal/spend_limit_expiration/activities";
import { proxyActivities } from "@temporalio/workflow";

const { expirePoolCapOverridesActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export async function expirePoolCapOverridesWorkflow(): Promise<void> {
  await expirePoolCapOverridesActivity();
}
