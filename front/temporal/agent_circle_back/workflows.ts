import { proxyActivities, sleep } from "@temporalio/workflow";

import type * as activities from "@app/temporal/agent_circle_back/activities";

const { postCircleBackMessageActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    maximumAttempts: 3,
  },
});

export async function agentCircleBackWorkflow(
  workspaceId: string,
  conversationId: string,
  agentConfigurationId: string,
  userId: string,
  message: string,
  delayMs: number
) {
  // Sleep for the specified delay
  await sleep(delayMs);

  // Post the message back to the conversation
  await postCircleBackMessageActivity(
    workspaceId,
    conversationId,
    agentConfigurationId,
    userId,
    message
  );
}
