import { TERMINAL_AGENT_MESSAGE_EVENT_TYPES } from "@app/types/assistant/agent_message_events";

const TERMINAL_EVENT_TYPES = new Set<string>([
  ...TERMINAL_AGENT_MESSAGE_EVENT_TYPES,
  "end-of-stream",
]);

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function getAgentLoopEventId(event: string | null): string {
  if (!event) {
    return "";
  }

  try {
    const parsed: unknown = JSON.parse(event);
    if (
      isJsonRecord(parsed) &&
      "eventId" in parsed &&
      typeof parsed.eventId === "string"
    ) {
      return parsed.eventId;
    }
  } catch {
    return "";
  }

  return "";
}

export function isTerminalAgentLoopEvent(event: string): boolean {
  try {
    const parsed: unknown = JSON.parse(event);
    return (
      isJsonRecord(parsed) &&
      "data" in parsed &&
      isJsonRecord(parsed.data) &&
      "type" in parsed.data &&
      typeof parsed.data.type === "string" &&
      TERMINAL_EVENT_TYPES.has(parsed.data.type)
    );
  } catch {
    return false;
  }
}

/**
 * @cc [owner:id13,label:concurrency;reliability] final-agent-blocking-event
 * The predicate MUST match only approval, authentication, or question events whose
 * isLastBlockingEventForStep flag is true. Invalid JSON MUST return false.
 */
export function shouldPauseAgentLoopStream(event: string): boolean {
  try {
    const parsed: unknown = JSON.parse(event);
    if (!isJsonRecord(parsed) || !isJsonRecord(parsed.data)) {
      return false;
    }
    const data = parsed.data;
    return (
      (data.type === "tool_approve_execution" ||
        data.type === "tool_personal_auth_required" ||
        data.type === "tool_file_auth_required" ||
        data.type === "tool_ask_user_question") &&
      data.isLastBlockingEventForStep === true
    );
  } catch {
    return false;
  }
}
