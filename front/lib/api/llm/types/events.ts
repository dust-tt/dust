import type { LLMErrorInfo } from "@app/lib/api/llm/types/errors";
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
  metadata: LLMClientMetadata & { id?: string; encrypted_content?: string };
}

export type LLMOutputItem =
  | TextGeneratedEvent
  | ReasoningGeneratedEvent
  | ToolCallEvent;

// Completion results

export interface TokenUsage {
  cacheCreationTokens?: number;
  cachedTokens?: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
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

export class EventError extends Error {
  public readonly type = "error";
  public readonly content: LLMErrorInfo;
  public readonly metadata: LLMClientMetadata;
  public readonly accumulatedErrors: EventError[] = [];

  constructor(
    content: LLMErrorInfo,
    metadata: LLMClientMetadata,
    accumulatedErrors: EventError[] = []
  ) {
    super(content.message);

    this.content = content;
    this.metadata = metadata;
    this.accumulatedErrors = accumulatedErrors;
  }
}

export type LLMEvent =
  | TextDeltaEvent
  | ReasoningDeltaEvent
  | ToolCallEvent
  | TextGeneratedEvent
  | ReasoningGeneratedEvent
  | TokenUsageEvent
  | SuccessCompletionEvent
  | EventError;
