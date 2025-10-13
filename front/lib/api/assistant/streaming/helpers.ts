import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { AgentErrorEvent, AgentMessageSuccessEvent } from "@app/types";

const END_OF_STREAM_EVENT = {
  type: "end-of-stream",
};
type EndOfStreamEvent = typeof END_OF_STREAM_EVENT;

export function isEndOfStreamEvent(event: unknown): event is EndOfStreamEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    event.type === END_OF_STREAM_EVENT.type
  );
}

export function isEndOfAgentMessageStreamEvent(
  event: AgentMessageEvents
): event is AgentMessageSuccessEvent | AgentErrorEvent {
  return ["agent_message_success", "agent_error"].includes(event.type);
}

/**
 * Conversation events.
 */

export function getConversationChannelId({
  conversationId,
}: {
  conversationId: string;
}) {
  return `conversation-${conversationId}`;
}

/**
 * Message events.
 */

export function getEventMessageChannelId(event: AgentMessageEvents) {
  // Tool approve execution can come from a sub agent, and in that case we want to send an event
  // to the main conversation.
  if (event.type === "tool_approve_execution" || event.type === "tool_error") {
    return getMessageChannelId(
      event.metadata?.pubsubMessageId ?? event.messageId
    );
  }
  return getMessageChannelId(event.messageId);
}

export function getMessageChannelId(messageId: string) {
  return `message-${messageId}`;
}
