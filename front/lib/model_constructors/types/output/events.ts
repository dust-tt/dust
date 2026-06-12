import type { AgentMetadata } from "@app/lib/model_constructors/types/agent_metadata";

export type ResponseIdContent = { responseId: string };

export interface ResponseIdEvent {
  type: "response_id";
  content: ResponseIdContent;
  metadata: AgentMetadata;
}

export type TextDeltaContent = { value: string };
export interface TextDeltaEvent {
  type: "text_delta";
  content: TextDeltaContent;
  metadata: AgentMetadata;
}

export type TextContent = { value: string };
export interface TextEvent {
  type: "text";
  content: TextContent;
  metadata: AgentMetadata;
}

export type ToolCallStartedContent = {
  id: string;
  index: number;
  name: string;
};
export interface ToolCallStartedEvent {
  type: "tool_call_started";
  content: ToolCallStartedContent;
  metadata: AgentMetadata;
}

export interface ToolCallDeltaEvent {
  type: "tool_call_delta";
  metadata: AgentMetadata;
}

export type ToolCallContent = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};
export interface ToolCallEvent {
  type: "tool_call";
  content: ToolCallContent;
  metadata: AgentMetadata;
}

export type ReasoningDeltaContent = { value: string };
export interface ReasoningDeltaEvent {
  type: "reasoning_delta";
  content: ReasoningDeltaContent;
  metadata: AgentMetadata;
}

export type ReasoningContent = { value: string };
export interface ReasoningEvent {
  type: "reasoning";
  content: ReasoningContent;
  metadata: AgentMetadata;
}

export type TokenUsageContent = {
  cacheCreated: number;
  cacheHit: number;
  standardInput: number;
  standardOutput: number;
  reasoning: number;
};
export interface TokenUsageEvent {
  type: "token_usage";
  content: TokenUsageContent;
  metadata: AgentMetadata;
}

export type SuccessContent = {
  aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[];
};
export interface SuccessEvent {
  type: "success";
  content: SuccessContent;
  metadata: AgentMetadata;
}

export const ERROR_TYPES = [
  "input_configuration_error",
  "stop_error",
  "refusal_error",
  "model_output_error",
  // HTTP errors
  "rate_limit_error",
  "overloaded_error",
  "invalid_request_error",
  "authentication_error",
  "permission_error",
  "not_found_error",
  "network_error",
  "timeout_error",
  "server_error",
  "stream_error",
  "unknown_error",
] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];
export type ErrorContent = {
  type: ErrorType;
  message: string;
  originalError?: unknown;
};
export interface ErrorEvent {
  type: "error";
  content: ErrorContent;
  metadata: AgentMetadata;
}

export type ModelResponseEvent =
  | ResponseIdEvent
  | TextDeltaEvent
  | TextEvent
  | ReasoningDeltaEvent
  | ReasoningEvent
  | ToolCallStartedEvent
  | ToolCallDeltaEvent
  | ToolCallEvent
  | TokenUsageEvent
  | SuccessEvent
  | ErrorEvent;

export type NonDeltaResponseEvent = Exclude<
  ModelResponseEvent,
  TextDeltaEvent | ReasoningDeltaEvent | ToolCallDeltaEvent
>;
