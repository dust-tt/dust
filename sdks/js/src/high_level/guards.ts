import type { APIError } from "../types";

export interface AgentMessage {
  type: "agent_message";
  sId: string;
  parentMessageId: string;
}

export interface ActionEventData {
  id: string;
  type: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
}

export function hasStringProperty<K extends string>(
  obj: unknown,
  key: K
): obj is { [P in K]: string } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    key in obj &&
    typeof (obj as Record<string, unknown>)[key] === "string"
  );
}

export function isAgentMessage(m: unknown): m is AgentMessage {
  return (
    typeof m === "object" &&
    m !== null &&
    "type" in m &&
    m.type === "agent_message" &&
    hasStringProperty(m, "sId") &&
    hasStringProperty(m, "parentMessageId")
  );
}

export function isAPIError(error: unknown): error is APIError {
  return (
    hasStringProperty(error, "type") && hasStringProperty(error, "message")
  );
}

export function isActionEventData(obj: unknown): obj is ActionEventData {
  return hasStringProperty(obj, "id") && hasStringProperty(obj, "type");
}
