import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type { ServiceTier } from "@app/lib/model_constructors/types/input/configuration";
import type { Lab } from "@app/lib/model_constructors/types/labs";

export type ResponseIdContent = { responseId: string };

export interface ResponseIdEvent {
  type: "response_id";
  content: ResponseIdContent;
  metadata: EndpointMetadata;
}

export type TextDeltaContent = { value: string };
export interface TextDeltaEvent {
  type: "text_delta";
  content: TextDeltaContent;
  metadata: EndpointMetadata;
}

export type TextContent = { value: string };
export interface TextEvent {
  type: "text";
  content: TextContent;
  metadata: EndpointMetadata;
}

export type ToolCallStartedContent = {
  id: string;
  index: number;
  name: string;
};
export interface ToolCallStartedEvent {
  type: "tool_call_started";
  content: ToolCallStartedContent;
  metadata: EndpointMetadata;
}

export interface ToolCallDeltaEvent {
  type: "tool_call_delta";
  metadata: EndpointMetadata;
}

export type ToolCallContent = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  namespace?: string;
};
export interface ToolCallEvent {
  type: "tool_call";
  content: ToolCallContent;
  metadata: EndpointMetadata;
}

export type ReasoningDeltaContent = { value: string };
export interface ReasoningDeltaEvent {
  type: "reasoning_delta";
  content: ReasoningDeltaContent;
  metadata: EndpointMetadata;
}

export type ReasoningContent = { value: string };
export interface ReasoningEvent {
  type: "reasoning";
  content: ReasoningContent;
  metadata: EndpointMetadata;
}

// Opaque provider-specific block (e.g. an Anthropic server-tool block) captured
// for verbatim replay. The block stays opaque to the generic pipeline.
// Passthrough blocks only originate from labs Dust talks to directly (Anthropic
// only today). Fireworks-hosted labs (moonshot_ai, thinking_machines, z_ai) and
// the noop lab never produce one. xai reuses the OpenAI Responses converter,
// which tags its passthrough blocks under the "openai" provider, so "xai" never
// appears as a passthrough value either. All are excluded to keep the value
// mappable to the persisted provider vocabulary.
export type PassthroughLab = Exclude<
  Lab,
  "moonshot_ai" | "thinking_machines" | "z_ai" | "xai"
>;

export type ProviderPassthroughContent = {
  provider: PassthroughLab;
  block: unknown;
};
export interface ProviderPassthroughEvent {
  type: "provider_passthrough";
  content: ProviderPassthroughContent;
  metadata: EndpointMetadata;
}

export type TokenUsageContent = {
  longCacheCreated: number;
  shortCacheCreated: number;
  cacheCreated: number;
  cacheHit: number;
  standardInput: number;
  // Inclusive billed output total. Provider adapters must normalize their raw
  // usage into this value, including reasoning and thinking tokens.
  totalOutput: number;
  // Optional reasoning and thinking subset of totalOutput. Never add it to
  // totalOutput for persistence or billing.
  reasoning?: number;
  // Processing tier the provider reports having served this response on, which
  // is what it bills for. Absent for providers that do not report one.
  serviceTier?: ServiceTier;
};
export interface TokenUsageEvent {
  type: "token_usage";
  content: TokenUsageContent;
  metadata: EndpointMetadata;
}

export type SuccessContent = {
  aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[];
  stopReason?: string;
};
export interface SuccessEvent {
  type: "success";
  content: SuccessContent;
  metadata: EndpointMetadata;
}

export const ERROR_TYPES = [
  "input_configuration_error",
  "stop_error",
  "refusal_error",
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

// Fault domain of the failure, not the code layer that happened to catch it.
export const ERROR_SOURCES = ["provider", "dust", "unknown"] as const;
export type ErrorSource = (typeof ERROR_SOURCES)[number];

export type ErrorContent = {
  type: ErrorType;
  message: string;
  originalError?: unknown;
  errorSource: ErrorSource;
};
export interface ErrorEvent {
  type: "error";
  content: ErrorContent;
  metadata: EndpointMetadata;
}

export type ModelResponseEvent =
  | ResponseIdEvent
  | TextDeltaEvent
  | TextEvent
  | ReasoningDeltaEvent
  | ReasoningEvent
  | ToolCallStartedEvent
  | ToolCallDeltaEvent
  | ToolCallEvent
  | ProviderPassthroughEvent
  | TokenUsageEvent
  | SuccessEvent
  | ErrorEvent;

export type NonDeltaResponseEvent = Exclude<
  ModelResponseEvent,
  TextDeltaEvent | ReasoningDeltaEvent | ToolCallDeltaEvent
>;
