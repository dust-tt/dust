import {
  isAgentMessageType,
  type AgentMessageType,
  type ConversationType,
} from "@app/types";
import assert from "assert";

/**
 * Cuts the conversation at the given step, exclusive, for the given agent
 * message. Conversation has already been prepared appropriately before for the
 * use case (post / edit / retry), this function only handles the step slicing
 * for a given agent message.
 * @param conversation
 * @param param1
 * @returns
 */
export function sliceConversation(
  conversation: ConversationType,
  { agentMessage, step }: { agentMessage: AgentMessageType; step: number }
): ConversationType {
  const slicedConversation = { ...conversation };
  const conversationAgentMessage = slicedConversation.content.findLast(
    (messages) =>
      messages.length > agentMessage.version &&
      messages[agentMessage.version].sId === agentMessage.sId
  )?.[agentMessage.version];

  assert(
    conversationAgentMessage && isAgentMessageType(conversationAgentMessage),
    "Unreachable"
  );

  // Mutation remains local to this function since conversation was first copied
  // into `slicedConversation`.
  conversationAgentMessage.contents = conversationAgentMessage.contents.filter(
    (content) => content.step < step
  );

  conversationAgentMessage.rawContents =
    conversationAgentMessage.rawContents.filter(
      (content) => content.step < step
    );

  conversationAgentMessage.actions = conversationAgentMessage.actions.filter(
    (action) => action.step < step
  );

  return slicedConversation;
}
