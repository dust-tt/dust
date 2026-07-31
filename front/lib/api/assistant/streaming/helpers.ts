import { CREDIT_APPROVAL_REQUIRED_ERROR_CODE } from "@app/lib/api/assistant/credit_approval";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import { TERMINAL_AGENT_MESSAGE_EVENT_TYPES } from "@app/lib/api/assistant/streaming/types";
import type {
  AgentErrorEvent,
  AgentMessageSuccessEvent,
} from "@app/types/assistant/agent";

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

/**
 * The credit safety net stops the loop through an `agent_error` because that event already carries
 * the persistence we need, but nothing failed: the message is parked awaiting the user's answer and
 * resumes in place, exactly like one blocked on a tool validation.
 *
 * So it must not be treated as terminal anywhere — not for the message status, not for the
 * conversation flags, and not for the stream lifecycle.
 */
// Deliberately not a type predicate: callers use it inside an already-narrowed `agent_error` case,
// where narrowing to `AgentErrorEvent` would collapse the negative branch to `never`.
export function isCreditApprovalRequestEvent(
  event: AgentMessageEvents
): boolean {
  return (
    event.type === "agent_error" &&
    event.error.code === CREDIT_APPROVAL_REQUIRED_ERROR_CODE
  );
}

export function isTerminalAgentMessageEvent(
  event: AgentMessageEvents
): boolean {
  if (isCreditApprovalRequestEvent(event)) {
    return false;
  }

  return TERMINAL_AGENT_MESSAGE_EVENT_TYPES.includes(event.type);
}

export function isEndOfAgentMessageStreamEvent(
  event: AgentMessageEvents
): event is AgentMessageSuccessEvent | AgentErrorEvent {
  // Publishing an `end-of-stream` marker for a credit-approval stop would close the server
  // generator and latch the client's EventSource shut for good, so the resumed run would only show
  // up on a page reload.
  //
  // Public-API blocking mode also keys off `end-of-stream`, but it can never observe this: the
  // per-message gate bails out on programmatic and API-key usage (see
  // `checkMessageCreditApprovalGate`).
  if (isCreditApprovalRequestEvent(event)) {
    return false;
  }

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
  if (
    event.type === "tool_approve_execution" ||
    event.type === "tool_error" ||
    event.type === "tool_personal_auth_required" ||
    event.type === "tool_file_auth_required" ||
    event.type === "tool_ask_user_question"
  ) {
    return getMessageChannelId(
      event.metadata?.pubsubMessageId ?? event.messageId
    );
  }
  return getMessageChannelId(event.messageId);
}

export function getMessageChannelId(messageId: string) {
  return `message-${messageId}`;
}
