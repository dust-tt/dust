import assert from "assert";

import { isAgentMessageType } from "@app/types";
import type {
  AgentMessageType,
  ConversationType,
} from "@app/types/assistant/conversation";

// TODO(DURABLE-AGENTS 2025-07-25): Consider moving inside this function the "conversation has
// already been prepared appropriately" part mentioned below, referring to
// e.g. front/lib/api/assistant/conversation.ts#retryAgentMessageL1308
/**
 * Cuts the conversation messages to properly handle post / edit / retry
 * actions, by removing future messages and messages sharing the same parent.
 * Cuts the agent message at the given step, exclusive, for the given agent
 * message.
 * Mutates the conversation in place, return the same conversation and the agent message.
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
): {
  slicedConversation: ConversationType;
  slicedAgentMessage: AgentMessageType;
} {
  const agentMessageIndex = conversation.content.findLastIndex(
    (versions) =>
      versions.length > agentMessageVersion &&
      versions[agentMessageVersion].sId === agentMessageId
  );

  assert(agentMessageIndex !== -1, "Agent message not found");

  const slicedAgentMessage =
    conversation.content[agentMessageIndex][agentMessageVersion];

  assert(
    slicedAgentMessage &&
      isAgentMessageType(slicedAgentMessage) &&
      slicedAgentMessage.version === agentMessageVersion,
    "Unreachable: Agent message not found or mismatched."
  );

  // Remove all messages after the agent message
  conversation.content = conversation.content.slice(0, agentMessageIndex + 1);

  // Remove all messages which have the same parent user message
  conversation.content = conversation.content.filter(
    (versions, index) =>
      index === agentMessageIndex ||
      // Only check the first version - all versions have the same parentMessageId
      !isAgentMessageType(versions[0]) ||
      versions[0].parentMessageId !== slicedAgentMessage.parentMessageId
  );

  // Now remove contents, rawContents, actions after the current step being processed
  slicedAgentMessage.contents = slicedAgentMessage.contents.filter(
    (content) => content.step < step
  );

  slicedAgentMessage.rawContents = slicedAgentMessage.rawContents.filter(
    (content) => content.step < step
  );

  slicedAgentMessage.actions = slicedAgentMessage.actions.filter(
    (action) => action.step < step
  );

  return {
    slicedConversation: conversation,
    slicedAgentMessage,
  };
}
