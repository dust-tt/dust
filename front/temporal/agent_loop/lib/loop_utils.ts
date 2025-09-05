import assert from "assert";

import type { ContentFragmentType } from "@app/types";
import { isAgentMessageType } from "@app/types";
import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";

// TODO(DURABLE-AGENTS 2025-07-25): Consider moving inside this function the "conversation has
// already been prepared appropriately" part mentioned below, referring to
// e.g. front/lib/api/assistant/conversation.ts#retryAgentMessageL1308
/**
 * Cuts the conversation at the given step, exclusive, for the given agent
 * message. Conversation has already been prepared appropriately before for the
 * use case (post / edit / retry), this function only handles the step slicing
 * for a given agent message.
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
  let slicedAgentMessage: AgentMessageType | undefined;
  // Copy
  const slicedConversation = {
    ...conversation,
    content: conversation.content
      .map((versions) => {
        if (versions.some((a) => a.sId === agentMessageId)) {
          // This is the versions group containing the agent message we need
          return versions.map((m) => {
            if (m.version === agentMessageVersion && isAgentMessageType(m)) {
              // Slice the agent message to the given step and keep it in local var
              slicedAgentMessage = {
                ...m,
                contents: m.contents.filter((content) => content.step < step),
                rawContents: m.rawContents.filter(
                  (content) => content.step < step
                ),
                actions: m.actions.filter((action) => action.step < step),
              };
              return slicedAgentMessage;
            } else {
              return m as AgentMessageType;
            }
          });
        } else {
          // If the agent message has already been found, ignore all remaining messages - we are probably retrying a past message
          if (slicedAgentMessage) {
            return [];
          }
          // Also skip agent messages that are currently running (other agents might have been triggered in parallel)
          return versions.filter(
            (message) =>
              !isAgentMessageType(message) || message.status !== "created"
          ) as AgentMessageType[] | UserMessageType[] | ContentFragmentType[];
        }
      })
      // Filter out removed versions group
      .filter((versions) => versions.length > 0),
  };

  console.log(
    "conversation",
    step,
    agentMessageId,
    agentMessageVersion,
    slicedConversation.content
  );

  assert(
    slicedAgentMessage &&
      isAgentMessageType(slicedAgentMessage) &&
      slicedAgentMessage.version === agentMessageVersion,
    "Unreachable: Agent message not found or mismatched."
  );

  return {
    slicedConversation,
    slicedAgentMessage,
  };
}
