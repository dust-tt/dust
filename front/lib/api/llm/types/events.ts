import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";

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
  metadata: LLMClientMetadata;
}

export interface ReasoningDeltaEvent {
  type: "reasoning_delta";
  content: Delta;
  metadata: LLMClientMetadata;
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
  metadata: LLMClientMetadata;
}

export interface TextGeneratedEvent {
  type: "text_generated";
  content: Text;
  metadata: LLMClientMetadata;
}

export interface ReasoningGeneratedEvent {
  type: "reasoning_generated";
  content: Text;
  metadata: LLMClientMetadata & Record<string, unknown>;
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
  metadata: LLMClientMetadata;
}

export interface SuccessCompletionEvent {
  type: "success";
  content: LLMOutputItem[];
  metadata: LLMClientMetadata;
}

export interface CompletionError {
  message: string;
  code: number;
}

export interface ErrorCompletionEvent {
  type: "error";
  content: CompletionError;
  metadata: LLMClientMetadata;
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
