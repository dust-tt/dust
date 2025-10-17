import type { ModelProviderIdType } from "@app/types";

export interface ProviderMetadata {
  provider: ModelProviderIdType;
  modelId: string;
  metadata: Record<string, any>;
}

// Stream events

export interface TextDeltaEvent {
  type: "text_delta";
  delta: string;
  metadata: ProviderMetadata;
}

export interface ReasoningDeltaEvent {
  type: "reasoning_delta";
  delta: string;
  metadata: ProviderMetadata;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolCallEvent {
  type: "tool_call";
  toolCall: ToolCall;
  metadata: ProviderMetadata;
}

export type LLMStreamEvent =
  | TextDeltaEvent
  | ReasoningDeltaEvent
  | ToolCallEvent
  | LLMCompletionResult;

// Output items

export interface TextGenerated {
  type: "text_generated";
  text: string;
  metadata: ProviderMetadata;
}

export interface ReasoningGenerated {
  type: "reasoning_generated";
  reasoning: string;
  metadata: ProviderMetadata;
}

export type LLMOutputItem = TextGenerated | ReasoningGenerated | ToolCallEvent;

// Completion results

export interface TokenUsage {
  inputTokens: number;
  reasoningTokens?: number;
  outputTokens: number;
  cachedTokens?: number;
}

export interface SuccessCompletionResult {
  type: "success";
  items: LLMOutputItem[];
  tokenUsage?: TokenUsage;
  metadata: ProviderMetadata;
}

export interface ErrorCompletionResult {
  type: "error";
  error: {
    message: string;
    code: string;
  };
  tokenUsage?: TokenUsage;
  metadata: ProviderMetadata;
}

export type LLMCompletionResult =
  | SuccessCompletionResult
  | ErrorCompletionResult;
