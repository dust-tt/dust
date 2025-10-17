import type { ModelProviderIdType } from "@app/types";

export type ProviderMetadata = Record<string, any> & {
  providerId: ModelProviderIdType;
  modelId: string;
};

export type Delta = {
  delta: string;
};

export type Text = {
  text: string;
};

// Stream events
export interface TextDeltaEvent {
  type: "text_delta";
  content: Delta;
  metadata: ProviderMetadata;
}

export interface ReasoningDeltaEvent {
  type: "reasoning_delta";
  content: Delta;
  metadata: ProviderMetadata;
}

// Output items
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolCallEvent {
  type: "tool_call";
  content: ToolCall;
  metadata: ProviderMetadata;
}

export interface TextGeneratedEvent {
  type: "text_generated";
  content: Text;
  metadata: ProviderMetadata;
}

export interface ReasoningGeneratedEvent {
  type: "reasoning_generated";
  content: Text;
  metadata: ProviderMetadata;
}

export type LLMOutputItem =
  | TextGeneratedEvent
  | ReasoningGeneratedEvent
  | ToolCallEvent;

// Completion results

export interface TokenUsage {
  inputTokens: number;
  reasoningTokens?: number;
  outputTokens: number;
  cachedTokens?: number;
  totalTokens: number;
}

export interface TokenUsageEvent {
  type: "token_usage";
  content: TokenUsage;
  metadata: ProviderMetadata;
}

export interface SuccessCompletionEvent {
  type: "success";
  content: LLMOutputItem[];
  metadata: ProviderMetadata;
}

export interface CompletionError {
  message: string;
  code: string;
}

export interface ErrorCompletionEvent {
  type: "error";
  content: CompletionError;
  metadata: ProviderMetadata;
}

export type LLMEvent =
  | TextDeltaEvent
  | ReasoningDeltaEvent
  | ToolCallEvent
  | TextGeneratedEvent
  | ReasoningGeneratedEvent
  | TokenUsageEvent
  | SuccessCompletionEvent
  | ErrorCompletionEvent;
