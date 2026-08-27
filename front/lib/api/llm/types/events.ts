import type { LLMErrorInfo } from "@app/lib/api/llm/types/errors";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import type { ServiceTier } from "@app/lib/model_constructors/types/input/configuration";
import type {
  AgentMessagePhase,
  AgentProviderPassthroughContentType,
} from "@app/types/assistant/agent_message_content";

export type Delta = {
  delta: string;
};

export type Text = {
  text: string;
};

// Prompt-cache diagnostics: why the cache prefix could not be reused vs. the
// previous request. `type` is the reason. `cacheMissedInputTokens` is the
// estimated lost-cache magnitude (only present on the `*_changed` reasons).
export interface CacheMissReason {
  type: string;
  cacheMissedInputTokens?: number;
}

// Provider response identification event
export interface ResponseIdEvent {
  type: "interaction_id";
  content: { modelInteractionId: string; cacheMissReason?: CacheMissReason };
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

export interface ToolCallStartedEvent {
  type: "tool_call_started";
  content: {
    id?: string;
    index?: number;
    name: string;
  };
  metadata: LLMClientMetadata;
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
  namespace?: string;
}

export interface ToolCallEvent {
  type: "tool_call";
  content: ToolCall;
  metadata: LLMClientMetadata & { thoughtSignature?: string };
}

export interface TextGeneratedEvent {
  type: "text_generated";
  content: Text;
  metadata: LLMClientMetadata & { phase?: AgentMessagePhase };
}

export interface ReasoningGeneratedEvent {
  type: "reasoning_generated";
  content: Text;
  metadata: LLMClientMetadata & { id?: string; encrypted_content?: string };
}

// Opaque provider-specific block that must be persisted and replayed verbatim
// to the producing provider. The generic pipeline forwards `block` without
// interpreting it.
export interface ProviderPassthroughEvent {
  type: "provider_passthrough";
  content: AgentProviderPassthroughContentType["value"];
  metadata: LLMClientMetadata;
}

export type LLMOutputItem =
  | TextGeneratedEvent
  | ReasoningGeneratedEvent
  | ToolCallEvent;

// Completion results

export interface TokenUsage {
  // Total cache-write tokens across all cache retention durations.
  cacheCreationTokens?: number;
  // Breakdown of cacheCreationTokens by cache retention duration, for
  // providers that bill long-lived cache writes at a premium over short-lived
  // ones. Absent when the provider only reports a flat total.
  longCacheCreationTokens?: number;
  shortCacheCreationTokens?: number;
  cachedTokens?: number;
  // Total input tokens including cache hits and cache creation tokens.
  inputTokens: number;
  // Total output tokens billed by the provider, including reasoning tokens.
  // Do not add reasoningTokens to this value. reasoningTokens is a subset.
  totalOutputTokens: number;
  // Reasoning and thinking portion of totalOutputTokens.
  reasoningTokens?: number;
  totalTokens: number;
  // Raw input tokens after the last cache breakpoint (not from cache).
  // This is the raw `input_tokens` value from providers that support caching.
  uncachedInputTokens?: number;
  // Processing tier the provider reports having billed this response at.
  serviceTier?: ServiceTier;
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
  // Raw provider stop/finish reason, verbatim and unmapped: why the turn ended.
  // Diagnostics only.
  stopReason?: string;
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
  | ToolCallStartedEvent
  | ToolCallDeltaEvent
  | ToolCallEvent
  | TextGeneratedEvent
  | ReasoningGeneratedEvent
  | ProviderPassthroughEvent
  | TokenUsageEvent
  | SuccessCompletionEvent
  | EventError;
