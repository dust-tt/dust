import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "./activities";

// Mirrors the production tool-activity config:
// heartbeatTimeout = TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS (60s), no retries.
const { jiraSearchStallActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: 60 * 1000,
  retry: { maximumAttempts: 1 },
});

const { canaryHeartbeatActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: 60 * 1000,
  retry: { maximumAttempts: 1 },
});

export async function stallWorkflow(): Promise<string> {
  return jiraSearchStallActivity();
}

export async function canaryWorkflow(seconds: number): Promise<string> {
  return canaryHeartbeatActivity(seconds);
}
