import type { ModelProviderIdType } from "@app/types";

export interface ProviderMetadata {
  provider: ModelProviderIdType;
  modelId: string;
  metadata: Record<string, any>;
}

export type LLMEventType =
  | "text_delta"
  | "reasoning_delta"
  | "tool_call"
  | "success"
  | "error"
  | "text_generated"
  | "reasoning_generated";

// Stream events
export interface LLMEvent {
  type: LLMEventType;
  content: string | ToolCall | LLMOutputItem[] | CompletionError;
  metadata: ProviderMetadata;
}

export interface TextDeltaEvent extends LLMEvent {
  type: "text_delta";
  content: string;
  metadata: ProviderMetadata;
}

export interface ReasoningDeltaEvent extends LLMEvent {
  type: "reasoning_delta";
  content: string;
  metadata: ProviderMetadata;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolCallEvent extends LLMEvent {
  type: "tool_call";
  content: ToolCall;
  metadata: ProviderMetadata;
}

// Output items

export interface TextGeneratedEvent extends LLMEvent {
  type: "text_generated";
  content: string;
  metadata: ProviderMetadata;
}

export interface ReasoningGeneratedEvent extends LLMEvent {
  type: "reasoning_generated";
  content: string;
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
}

export interface SuccessCompletionEvent extends LLMEvent {
  type: "success";
  content: LLMOutputItem[];
  tokenUsage?: TokenUsage;
  metadata: ProviderMetadata;
}

export interface CompletionError {
  message: string;
  code: string;
}

export interface ErrorCompletionEvent extends LLMEvent {
  type: "error";
  content: CompletionError;
  tokenUsage?: TokenUsage;
  metadata: ProviderMetadata;
}
