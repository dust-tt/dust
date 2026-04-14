import type { Model } from "@app/lib/api/models/types/providers";

export type ResponseIdContent = { responseId: string };

export interface ResponseIdEvent {
  type: "response_id";
  content: ResponseIdContent;
  metadata: Metadata;
}

export type TextDeltaContent = {
  value: string;
};
export interface TextDeltaEvent {
  type: "text_delta";
  content: TextDeltaContent;
  metadata: Metadata;
}

export type TextContent = {
  value: string;
};
export interface TextEvent {
  type: "text";
  content: TextContent;
  metadata: Metadata;
}

export type ToolCallContent = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};
export interface ToolCallEvent {
  type: "tool_call";
  content: ToolCallContent;
  metadata: Metadata;
}

export type ReasoningDeltaContent = {
  value: string;
};
export interface ReasoningDeltaEvent {
  type: "reasoning_delta";
  content: ReasoningDeltaContent;
  metadata: Metadata;
}

export type ReasoningContent = {
  value: string;
};
export interface ReasoningEvent {
  type: "reasoning";
  content: ReasoningContent;
  metadata: Metadata;
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
  metadata: Metadata;
}

export type SuccessContent = {
  aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[];
};
export interface SuccessEvent {
  type: "success";
  content: SuccessContent;
  metadata: Metadata;
}

export const ERROR_TYPES = ["input_configuration", "stream"] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];
export type ErrorContent = {
  type: ErrorType;
  message: string;
  originalError?: unknown;
};
export interface ErrorEvent {
  type: "error";
  content: ErrorContent;
  metadata: Metadata;
}

type Metadata = Model & { content?: Record<string, unknown> };

export type LargeLanguageModelResponseEvent =
  | ResponseIdEvent
  | TextDeltaEvent
  | TextEvent
  | ReasoningDeltaEvent
  | ReasoningEvent
  | ToolCallEvent
  | TokenUsageEvent
  | SuccessEvent
  | ErrorEvent;
