import type { LLMErrorInfo } from "@app/lib/api/llm/types/errors";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";

export type Delta = {
  delta: string;
};

export type Text = {
  text: string;
};

// Provider response identification event
export interface ResponseIdEvent {
  type: "interaction_id";
  content: { modelInteractionId: string };
  metadata: LLMClientMetadata;
}

// Stream events
export interface TextDeltaEvent {
  type: "text_delta";
  content: Delta;
  metadata: LLMClientMetadata;
}

export interface ReasoningDeltaEvent {
  type: "reasoning_delta";
  content: Delta;
  metadata: LLMClientMetadata & { encrypted_content?: string };
}

// Tool call deltas are not streamed to the UI but they are used internally
// as heartbeat to know the LLM is still active.
export interface ToolCallDeltaEvent {
  type: "tool_call_delta";
  metadata: LLMClientMetadata;
}

// Output items
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallEvent {
  type: "tool_call";
  content: ToolCall;
  metadata: LLMClientMetadata & { thoughtSignature?: string };
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
  // Raw input tokens after the last cache breakpoint (not from cache).
  // This is the raw `input_tokens` value from providers that support caching.
  uncachedInputTokens?: number;
}

export interface TokenUsageEvent {
  type: "token_usage";
  content: TokenUsage;
  metadata: LLMClientMetadata;
}

export interface SuccessCompletionEvent {
  type: "success";
  aggregated: LLMOutputItem[];
  textGenerated?: TextGeneratedEvent;
  reasoningGenerated?: ReasoningGeneratedEvent;
  toolCalls?: ToolCallEvent[];
  metadata: LLMClientMetadata;
}

export class EventError extends Error {
  public readonly type = "error";
  public readonly content: LLMErrorInfo;
  public readonly metadata: LLMClientMetadata;

  constructor(content: LLMErrorInfo, metadata: LLMClientMetadata) {
    super(content.message);

    this.content = content;
    this.metadata = metadata;
  }
}

export type LLMEvent =
  | ResponseIdEvent
  | TextDeltaEvent
  | ReasoningDeltaEvent
  | ToolCallDeltaEvent
  | ToolCallEvent
  | TextGeneratedEvent
  | ReasoningGeneratedEvent
  | TokenUsageEvent
  | SuccessCompletionEvent
  | EventError;
