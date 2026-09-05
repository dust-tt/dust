import type { Model } from "@/types/providers";

export type ResponseIdContent = { responseId: string };

export interface ResponseIdEvent {
  type: "response_id";
  content: ResponseIdContent;
}

export type TextDeltaContent = {
  value: string;
};
export interface TextDeltaEvent {
  type: "text_delta";
  content: TextDeltaContent;
}

export type TextContent = {
  value: string;
};
export interface TextEvent {
  type: "text";
  content: TextContent;
}

export type ToolCallContent = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};
export interface ToolCallEvent {
  type: "tool_call";
  content: ToolCallContent;
}

export type ReasoningDeltaContent = {
  value: string;
};
export interface ReasoningDeltaEvent {
  type: "reasoning_delta";
  content: ReasoningDeltaContent;
}

export type ReasoningContent = {
  value: string;
};
export interface ReasoningEvent {
  type: "reasoning";
  content: ReasoningContent;
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
}

export type SuccessContent = {
  aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[];
};
export interface SuccessEvent {
  type: "success";
  content: SuccessContent;
}

export const ERROR_TYPES = ["input_configuration", "stream"] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];
export type ErrorContent = {
  type: ErrorType;
  message: string;
};
export interface ErrorEvent {
  type: "error";
  content: ErrorContent;
}

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

type Metadata = Model & { content?: Record<string, unknown> };

export type ResponseIdEventWithMetadata = ResponseIdEvent & {
  metadata: Metadata;
};
export type TextDeltaEventWithMetadata = TextDeltaEvent & {
  metadata: Metadata;
};
export type TextEventWithMetadata = TextEvent & {
  metadata: Metadata;
};
export type ReasoningDeltaEventWithMetadata = ReasoningDeltaEvent & {
  metadata: Metadata;
};
export type ReasoningEventWithMetadata = ReasoningEvent & {
  metadata: Metadata;
};
export type ToolCallEventWithMetadata = ToolCallEvent & {
  metadata: Metadata;
};
export type TokenUsageEventWithMetadata = TokenUsageEvent & {
  metadata: Metadata;
};
export type SuccessEventWithMetadata = SuccessEvent & {
  metadata: Metadata;
};
export type ErrorEventWithMetadata = ErrorEvent & {
  metadata: Metadata;
};

export type LargeLanguageModelResponseEventWithMetadata =
  | ResponseIdEventWithMetadata
  | TextDeltaEventWithMetadata
  | TextEventWithMetadata
  | ReasoningDeltaEventWithMetadata
  | ReasoningEventWithMetadata
  | ToolCallEventWithMetadata
  | TokenUsageEventWithMetadata
  | SuccessEventWithMetadata
  | ErrorEventWithMetadata;
