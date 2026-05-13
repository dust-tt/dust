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
}: SandboxKillRequesterWorkflowInput): Promise<{ updatedCount: number }> {
  let updatedCount = 0;
  // Loop until the activity reports an empty batch, signalling all matching
  // rows have been marked.
  for (;;) {
    const affected = await requestSandboxKillsActivity({ baseImage, version });
    updatedCount += affected;
    if (affected === 0) {
      break;
    }
  }

  return { updatedCount };
}
