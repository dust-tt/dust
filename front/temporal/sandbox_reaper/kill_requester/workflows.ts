import type * as activities from "@app/temporal/sandbox_reaper/kill_requester/activities";
import { proxyActivities } from "@temporalio/workflow";

const { requestSandboxKillsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: 3,
  },
});

interface SandboxKillRequesterWorkflowInput {
  baseImage: string;
  version?: string;
}

export async function sandboxKillRequesterWorkflow({
  baseImage,
  version,
}: SandboxKillRequesterWorkflowInput): Promise<void> {
  let hasMore = true;
  while (hasMore) {
    hasMore = await requestSandboxKillsActivity({ baseImage, version });
  }
}
