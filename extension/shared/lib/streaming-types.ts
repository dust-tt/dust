import type {
  AgentMessagePublicType,
  UserMessageType,
} from "@dust-tt/client";

/**
 * Stream event types for conversation message streaming.
 * Used by mobile (XHR-based) and potentially browser (ReadableStream-based) implementations.
 */
export type StreamEvent =
  | { type: "user_message_new"; message: UserMessageType }
  | { type: "agent_message_new"; message: AgentMessagePublicType }
  | {
      type: "generation_tokens";
      text: string;
      classification: "tokens" | "chain_of_thought";
    }
  | { type: "agent_message_success"; message: AgentMessagePublicType }
  | { type: "user_message_error"; error: StreamError }
  | { type: "agent_error"; error: StreamError }
  | { type: "agent_action_success"; action: unknown };

export type StreamError = {
  code: string;
  message: string;
};

export type StreamEventType = StreamEvent["type"];

/**
 * Maps a parsed SSE data object to a typed StreamEvent.
 * Returns null for unknown event types (which should be skipped).
 */
export function mapToStreamEvent(
  parsed: Record<string, unknown>
): StreamEvent | null {
  const type = parsed.type as string;

  switch (type) {
    case "user_message_new":
      return {
        type: "user_message_new",
        message: parsed.message as UserMessageType,
      };

    case "agent_message_new":
      return {
        type: "agent_message_new",
        message: parsed.message as AgentMessagePublicType,
      };

    case "generation_tokens":
      return {
        type: "generation_tokens",
        text: parsed.text as string,
        classification: parsed.classification as "tokens" | "chain_of_thought",
      };

    case "agent_message_success":
      return {
        type: "agent_message_success",
        message: parsed.message as AgentMessagePublicType,
      };

    case "user_message_error":
      return {
        type: "user_message_error",
        error: parsed.error as StreamError,
      };

    case "agent_error":
      return {
        type: "agent_error",
        error: parsed.error as StreamError,
      };

    case "agent_action_success":
      return {
        type: "agent_action_success",
        action: parsed.action,
      };

    default:
      // Skip unknown event types
      return null;
  }
}

/**
 * Type guard to check if an event is a terminal event (success or error).
 */
export function isTerminalEvent(event: StreamEvent): boolean {
  return (
    event.type === "agent_message_success" ||
    event.type === "agent_error" ||
    event.type === "user_message_error"
  );
}

/**
 * Type guard to check if an event is an error event.
 */
export function isErrorEvent(
  event: StreamEvent
): event is
  | { type: "agent_error"; error: StreamError }
  | { type: "user_message_error"; error: StreamError } {
  return event.type === "agent_error" || event.type === "user_message_error";
}
