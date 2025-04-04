import { publishEvent } from "@app/lib/api/assistant/pubsub";
import logger from "@app/logger/logger";

function getActionChannel(actionId: number): string {
  return `action-${actionId}`;
}

export async function validateAction({
  workspaceId,
  conversationId,
  messageId,
  actionId,
  approved,
}: {
  workspaceId: string;
  conversationId: string;
  messageId: string;
  actionId: number;
  approved: boolean;
}): Promise<{ success: boolean }> {
  const actionChannel = getActionChannel(actionId);
  const eventType = approved ? "action_approved" : "action_rejected";

  logger.info(
    {
      workspaceId,
      conversationId,
      messageId,
      actionId,
      approved,
    },
    "Action validation request"
  );

  // Publish validation event to the action channel
  await publishEvent({
    origin: "action_validation",
    channel: actionChannel,
    event: JSON.stringify({
      type: eventType,
      created: Date.now(),
      actionId: actionId,
      messageId: messageId,
    }),
  });

  logger.info(
    {
      workspaceId,
      conversationId,
      messageId,
      actionId,
    },
    `Action ${approved ? "approved" : "rejected"} by user`
  );

  return { success: true };
}
