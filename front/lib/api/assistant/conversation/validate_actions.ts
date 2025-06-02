import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import { isMCPApproveExecutionEvent } from "@app/lib/actions/mcp";
import {
  getMessageChannelId,
  publishEvent,
} from "@app/lib/api/assistant/pubsub";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import logger from "@app/logger/logger";

function getActionChannel(actionId: string): string {
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
  actionId: string;
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
    "Tool validation request"
  );

  // Publish validation event to the action channel
  await publishEvent({
    origin: "action_validation",
    channel: actionChannel,
    event: JSON.stringify({
      type: approved,
      created: Date.now(),
      actionId,
      messageId,
    }),
  });

  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    return isMCPApproveExecutionEvent(payload)
      ? payload.actionId === actionId
      : false;
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
