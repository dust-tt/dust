import { proxyActivities } from "@temporalio/workflow";

import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/analytics_queue/activities";
import type {
  AgentLoopArgs,
  AgentMessageRef,
} from "@app/types/assistant/agent_run";

const { storeAgentAnalyticsActivity, storeAgentMessageFeedbackActivity } =
  proxyActivities<typeof activities>({
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

export async function storeAgentMessageFeedbackWorkflow(
  authType: AuthenticatorType,
  {
    message,
  }: {
    message: AgentMessageRef;
  }
): Promise<void> {
  await storeAgentMessageFeedbackActivity(authType, {
    message,
  });
}
