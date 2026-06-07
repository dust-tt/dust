import type { ModelId } from "@app/lib/model_constructors/types/model_ids";
import type { ProviderApi } from "@app/lib/model_constructors/types/provider_apis";
import type { ProviderId } from "@app/lib/model_constructors/types/provider_ids";
import type { Region } from "@app/lib/model_constructors/types/regions";

// The model identity stamped onto every output event. It mirrors the static
// descriptor captured by the endpoint class (`providerId`/`api`/`region`/
// `modelId`); `content` carries optional per-event extras (e.g. a reasoning
// block's signature).
export type EventMetadata = {
  providerId: ProviderId;
  api: ProviderApi;
  region: Region;
  modelId: ModelId;
  content?: Record<string, unknown>;
};

export type ResponseIdContent = { responseId: string };
export interface ResponseIdEvent {
  type: "response_id";
  content: ResponseIdContent;
  metadata: EventMetadata;
}

export type TextDeltaContent = { value: string };
export interface TextDeltaEvent {
  type: "text_delta";
  content: TextDeltaContent;
  metadata: EventMetadata;
}

export type TextContent = { value: string };
export interface TextEvent {
  type: "text";
  content: TextContent;
  metadata: EventMetadata;
}

export type ToolCallStartedContent = {
  id: string;
  index: number;
  name: string;
};
export interface ToolCallStartedEvent {
  type: "tool_call_started";
  content: ToolCallStartedContent;
  metadata: EventMetadata;
}

// Tool call deltas are not streamed to the UI but used internally as a
// heartbeat to know the LLM is still active.
export interface ToolCallDeltaEvent {
  type: "tool_call_delta";
  metadata: EventMetadata;
}

export type ToolCallContent = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};
export interface ToolCallEvent {
  type: "tool_call";
  content: ToolCallContent;
  metadata: EventMetadata;
}

export type ReasoningDeltaContent = { value: string };
export interface ReasoningDeltaEvent {
  type: "reasoning_delta";
  content: ReasoningDeltaContent;
  metadata: EventMetadata;
}

export type ReasoningContent = { value: string };
export interface ReasoningEvent {
  type: "reasoning";
  content: ReasoningContent;
  metadata: EventMetadata;
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
  metadata: EventMetadata;
}

export type SuccessContent = {
  aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[];
};
export interface SuccessEvent {
  type: "success";
  content: SuccessContent;
  metadata: EventMetadata;
}

export const ERROR_TYPES = [
  "input_configuration_error",
  // LLM-level errors
  "stop_error",
  "refusal_error",
  // The model produced malformed output (e.g. invalid tool-call JSON). Retryable
  // since a fresh sampling can succeed, unlike a deterministic bad request.
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
  metadata: EventMetadata;
}

// Factory for `ErrorEvent`s. Providers map their SDK errors to a unified error
// type + message; this collapses the otherwise-repeated event-shape boilerplate.
export function buildErrorEvent({
  metadata,
  type,
  message,
  originalError,
}: {
  metadata: EventMetadata;
  type: ErrorType;
  message: string;
  originalError?: unknown;
}): ErrorEvent {
  return {
    type: "error",
    content: { type, message, originalError },
    metadata,
  };
}

export type LargeLanguageModelResponseEvent =
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

// The events emitted by non-streaming inference (e.g. batch), where a complete
// response is converted at once: every response event except the streaming-only
// delta heartbeats, which only make sense while tokens are arriving.
export type NonDeltaResponseEvent = Exclude<
  LargeLanguageModelResponseEvent,
  TextDeltaEvent | ReasoningDeltaEvent | ToolCallDeltaEvent
>;
