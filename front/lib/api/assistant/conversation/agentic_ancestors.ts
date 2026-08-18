import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";

export type AgenticAncestor = {
  agentConfigurationId: string;
  agentMessageId: string;
  agenticMessageType: "run_agent" | "agent_handover";
  conversation: ConversationResource;
};

/**
 * Lists the agent messages that led to the current conversation, starting with the direct parent.
 *
 * When `onlyRunAgent` is set, the walk stops at the first non-run_agent edge
 * (i.e. an agent_handover): a handover runs in the parent conversation and is
 * billed/attributed there directly, so its cost must not roll up past that
 * boundary.
 */
export async function listAgenticAncestors(
  auth: Authenticator,
  conversation: ConversationResource,
  {
    agentMessageId,
    includeDeleted = false,
    maxAncestors,
    onlyRunAgent = false,
  }: {
    agentMessageId: string;
    includeDeleted?: boolean;
    maxAncestors?: number;
    onlyRunAgent?: boolean;
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
      visitedAgentMessageIds.has(parentAgentMessage.agentMessageId) ||
      (onlyRunAgent && parentAgentMessage.agenticMessageType !== "run_agent")
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
      agenticMessageType: parentAgentMessage.agenticMessageType,
      conversation: parentConversation,
    });
    cursor = {
      conversation: parentConversation,
      agentMessageId: parentAgentMessage.agentMessageId,
    };
  }

  return ancestors;
}
