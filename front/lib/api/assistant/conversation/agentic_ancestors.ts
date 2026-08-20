import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";

export type AgenticAncestor = {
  agentConfigurationId: string;
  agentMessageId: string;
  conversation: ConversationResource;
};

/**
 * Lists the agent messages that led to the current conversation, starting with the direct parent.
 */
export async function listAgenticAncestors(
  auth: Authenticator,
  conversation: ConversationResource,
  {
    agentMessageId,
    includeDeleted = false,
    maxAncestors,
  }: {
    agentMessageId: string;
    includeDeleted?: boolean;
    maxAncestors?: number;
  }
): Promise<AgenticAncestor[]> {
  const ancestors: AgenticAncestor[] = [];
  const visitedAgentMessageIds = new Set([agentMessageId]);
  let cursor = { conversation, agentMessageId };

  while (maxAncestors === undefined || ancestors.length < maxAncestors) {
    const parentAgentMessage = await cursor.conversation.findAgenticParent(
      auth,
      { agentMessageId: cursor.agentMessageId }
    );
    if (
      !parentAgentMessage ||
      visitedAgentMessageIds.has(parentAgentMessage.agentMessageId)
    ) {
      break;
    }

    const [parentConversation] = await ConversationResource.fetchByModelIds(
      auth,
      [parentAgentMessage.conversationModelId],
      { includeDeleted, loadSpaces: true }
    );
    if (!parentConversation) {
      break;
    }

    visitedAgentMessageIds.add(parentAgentMessage.agentMessageId);
    ancestors.push({
      agentConfigurationId: parentAgentMessage.agentConfigurationId,
      agentMessageId: parentAgentMessage.agentMessageId,
      conversation: parentConversation,
    });
    cursor = {
      conversation: parentConversation,
      agentMessageId: parentAgentMessage.agentMessageId,
    };
  }

  return ancestors;
}
