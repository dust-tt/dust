import { proxyActivities, sleep } from "@temporalio/workflow";

import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/notifications_queue/activities";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

const NOTIFICATION_DELAY_MS = 30000;

const { sendUnreadConversationNotificationActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "1 minute",
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
  // Wait before triggering the notification.
  await sleep(NOTIFICATION_DELAY_MS);

  await sendUnreadConversationNotificationActivity(authType, agentLoopArgs);
}
