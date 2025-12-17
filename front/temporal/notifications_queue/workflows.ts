import { proxyActivities, sleep } from "@temporalio/workflow";

import type { AuthenticatorType } from "@app/lib/auth";
import { NOTIFICATION_DELAY_MS } from "@app/temporal/agent_loop/workflows";
import type * as activities from "@app/temporal/notifications_queue/activities";
import { isDevelopment } from "@app/types";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

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
  // Wait before triggering the notification (3s in dev, 30s in prod).
  await sleep(isDevelopment() ? 3000 : NOTIFICATION_DELAY_MS);

  await sendUnreadConversationNotificationActivity(authType, agentLoopArgs);
}
