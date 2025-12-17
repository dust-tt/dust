import { proxyActivities, sleep } from "@temporalio/workflow";

import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/usage_queue/activities";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

const { recordUsageActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

const { trackProgrammaticUsageActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    maximumAttempts: 1,
  },
});

export async function updateWorkspaceUsageWorkflow(workspaceId: string) {
  // Sleep for one hour before computing usage.
  await sleep(60 * 60 * 1000);

  await recordUsageActivity(workspaceId);
}

export async function trackProgrammaticUsageWorkflow(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  await trackProgrammaticUsageActivity(authType, {
    agentLoopArgs,
  });
}
