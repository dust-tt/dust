import { proxyActivities } from "@temporalio/workflow";

import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/analytics_queue/activities";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

const { storeAgentAnalyticsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    // Analytics is best effort, only retry twice.
    maximumAttempts: 2,
  },
});

export async function storeAgentAnalyticsWorkflow(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  await storeAgentAnalyticsActivity(authType, {
    agentLoopArgs,
  });
}
