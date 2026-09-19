import { TERMINAL_AGENT_MESSAGE_EVENT_TYPES } from "@app/lib/api/assistant/streaming/types";

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
