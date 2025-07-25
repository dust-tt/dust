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
export function sliceConversationForAgentMessage(
  conversation: ConversationType,
  {
    agentMessageId,
    agentMessageVersion,
    step,
  }: {
    agentMessageId: string;
    agentMessageVersion: number;
    step: number;
  }
): ConversationType {
  const slicedConversation = { ...conversation };
  const slicedAgentMessage = slicedConversation.content.findLast(
    (messages) =>
      messages.length > agentMessageVersion &&
      messages[agentMessageVersion].sId === agentMessageId
  )?.[agentMessageVersion];

  assert(
    slicedAgentMessage && isAgentMessageType(slicedAgentMessage),
    "Unreachable"
  );

  // Mutation remains local to this function since conversation was first copied
  // into `slicedConversation`.
  slicedAgentMessage.contents = slicedAgentMessage.contents.filter(
    (content) => content.step < step
  );

  slicedAgentMessage.rawContents = slicedAgentMessage.rawContents.filter(
    (content) => content.step < step
  );

  slicedAgentMessage.actions = slicedAgentMessage.actions.filter(
    (action) => action.step < step
  );

  return slicedConversation;
}
