import type * as activities from "@app/temporal/conversation_fork_queue/activities";
import { proxyActivities } from "@temporalio/workflow";

const { copyConversationGCSMountActivity } = proxyActivities<typeof activities>(
  {
    startToCloseTimeout: "10 minutes",
    retry: {
      maximumAttempts: 3,
      initialInterval: "5s",
      backoffCoefficient: 2,
      maximumInterval: "1m",
    },
  }
);

export async function conversationForkWorkflow({
  workspaceId,
  sourceConversationId,
  destConversationId,
}: {
  workspaceId: string;
  sourceConversationId: string;
  destConversationId: string;
}): Promise<void> {
  await copyConversationGCSMountActivity({
    workspaceId,
    sourceConversationId,
    destConversationId,
  });
}
