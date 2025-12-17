import { proxyActivities } from "@temporalio/workflow";

import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/notifications_queue/activities";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

const { sendUnreadConversationNotificationActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
  retry: {
    maximumAttempts: 2,
  },
});

export async function sendUnreadConversationNotificationWorkflow(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  await sendUnreadConversationNotificationActivity(authType, agentLoopArgs);
}
