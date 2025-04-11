import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { MCPApproveExecutionEvent } from "@app/lib/actions/mcp";
import {
  getMessageChannelId,
  publishEvent,
} from "@app/lib/api/assistant/pubsub";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
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
  approved: MCPValidationOutputType;
}): Promise<{ success: boolean }> {
  const actionChannel = getActionChannel(actionId);

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
      type: approved,
      created: Date.now(),
      actionId: actionId,
      messageId: messageId,
    }),
  });

  void getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    const { action } = payload as MCPApproveExecutionEvent;
    if (!action) {
      return false;
    }
    const { id } = action;
    return actionId === id;
  }, getMessageChannelId(messageId));

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
