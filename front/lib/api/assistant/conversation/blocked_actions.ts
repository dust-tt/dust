import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";

export type GetBlockedActionsResponseType = {
  blockedActions: BlockedToolExecution[];
};

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
    await ConversationResource.clearActionRequiredForConversation(
      auth,
      conversation
    );
  }
}
