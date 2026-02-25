import type * as activities from "@app/temporal/sandbox_reaper/activities";
import { proxyActivities } from "@temporalio/workflow";

const { reapStaleSandboxesActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: "1 minute",
  retry: {
    maximumAttempts: 3,
  },
});

export async function sandboxReaperWorkflow(): Promise<void> {
  let hasMore = true;
  while (hasMore) {
    hasMore = await reapStaleSandboxesActivity();
  }
}
