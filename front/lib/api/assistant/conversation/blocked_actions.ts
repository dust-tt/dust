import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { isMCPApproveExecutionEvent } from "@app/lib/actions/mcp";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type {
  AgentMessageType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";

export type GetBlockedActionsResponseType = {
  blockedActions: BlockedToolExecution[];
};

/**
 * Resolves the blocked actions of an agent message that reached a terminal status (interrupted,
 * cancelled, failed, ...). The message will never resume, so tools still waiting on user input
 * (e.g. a manual approval) can never run: deny them so the conversation stops surfacing pending
 * approvals and doesn't stay flagged as requiring an action in the inbox.
 */
export async function resolveBlockedActionsForTerminatedMessage(
  auth: Authenticator,
  {
    conversation,
    agentMessage,
  }: {
    conversation: ConversationWithoutContentType;
    agentMessage: Pick<AgentMessageType, "agentMessageId" | "sId">;
  }
): Promise<void> {
  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForAgentMessage(auth, {
      agentMessageId: agentMessage.agentMessageId,
    });

  if (blockedActions.length === 0) {
    return;
  }

  // Sequential DB updates are fine here: the number of blocked actions is bounded by the
  // per-step action limit.
  for (const action of blockedActions) {
    await action.updateStatus("denied");
  }

  logger.info(
    {
      actionIds: blockedActions.map((a) => a.sId),
      conversationId: conversation.sId,
      messageId: agentMessage.sId,
      workspaceId: auth.getNonNullableWorkspace().sId,
    },
    "Denied blocked actions of terminated agent message"
  );

  // Remove the pending tool approval request events from the message channel so live clients
  // stop surfacing approval dialogs for them.
  const blockedActionIds = new Set(blockedActions.map((a) => a.sId));
  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    return (
      isMCPApproveExecutionEvent(payload) &&
      blockedActionIds.has(payload.actionId)
    );
  }, getMessageChannelId(agentMessage.sId));

  await clearActionRequiredIfNoBlockedActions(auth, {
    conversationId: conversation.sId,
  });
}

/**
 * Clears the participants' `actionRequired` flag of a conversation if no blocked action remains.
 * The flag is denormalized (set when a tool starts waiting on user input, cleared when an agent
 * loop is launched), so it can go stale when a blocked message is terminated without its blocked
 * actions being resolved.
 */
export async function clearActionRequiredIfNoBlockedActions(
  auth: Authenticator,
  { conversationId }: { conversationId: string }
): Promise<void> {
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );
  if (!conversation) {
    return;
  }

  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForConversation(
      auth,
      conversation
    );

  if (blockedActions.length === 0) {
    await ConversationResource.clearActionRequired(auth, conversationId);
  }
}
