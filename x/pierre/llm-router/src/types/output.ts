import type {
  CompletionEventMetadata,
  ReasoningDeltaEventMetadata,
  ReasoningGeneratedEventMetadata,
  ResponseIdEventMetadata,
  TextDeltaEventMetadata,
  TextGeneratedEventMetadata,
  ToolCallArgumentsDeltaEventMetadata,
  ToolCallRequestEventMetadata,
} from "@/types/metadata";
import type { Model } from "@/types/model";

export interface ResponseIdEvent {
  type: "interaction_id";
  content: { id: string };
}
export interface WithMetadataResponseIdEvent extends ResponseIdEvent {
  metadata: ResponseIdEventMetadata;
}

export interface TextDeltaEvent {
  type: "text_delta";
  content: { value: string };
}
export interface WithMetadataTextDeltaEvent extends TextDeltaEvent {
  metadata: TextDeltaEventMetadata;
}

export interface TextGeneratedEvent {
  type: "text_generated";
  content: { value: string };
}
export interface WithMetadataTextGeneratedEvent extends TextGeneratedEvent {
  metadata: TextGeneratedEventMetadata;
}

export interface ReasoningDeltaEvent {
  type: "reasoning_delta";
  content: { value: string };
}
export interface WithMetadataReasoningDeltaEvent extends ReasoningDeltaEvent {
  metadata: ReasoningDeltaEventMetadata;
}

export interface ReasoningGeneratedEvent {
  type: "reasoning_generated";
  content: { value: string };
}
export interface WithMetadataReasoningGeneratedEvent
  extends ReasoningGeneratedEvent {
  metadata: ReasoningGeneratedEventMetadata;
}

export interface ToolCallRequestEvent {
  type: "tool_call_request";
  content: {
    toolName: string;
    toolCallId: string;
    arguments: string;
  };
}
export interface WithMetadataToolCallRequestEvent extends ToolCallRequestEvent {
  metadata: ToolCallRequestEventMetadata;
}

export interface ToolCallDeltaEvent {
  type: "tool_call_delta";
  content: {
    toolName: string;
    toolCallId: string;
    delta: string;
  };
}
export interface WithMetadataToolCallDeltaEvent extends ToolCallDeltaEvent {
  metadata: ToolCallArgumentsDeltaEventMetadata;
}

export type OutputEvent =
  | ReasoningGeneratedEvent
  | TextGeneratedEvent
  | ToolCallRequestEvent;
export type WithMetadataOutputEvent =
  | WithMetadataResponseIdEvent
  | WithMetadataReasoningGeneratedEvent
  | WithMetadataTextGeneratedEvent
  | WithMetadataToolCallRequestEvent;

export interface TokenUsageEvent {
  type: "token_usage";
  content: {
    cacheWriteTokens: number;
    cacheReadTokens: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
  };
}
export interface WithMetadataTokenUsageEvent extends TokenUsageEvent {
  metadata: Model;
}

export interface CompletionEvent {
  type: "completion";
  content: {
    value: WithMetadataOutputEvent[];
  };
}
export interface WithMetadataCompletionEvent extends CompletionEvent {
  metadata: CompletionEventMetadata;
}

export interface ErrorEvent {
  type: "error";
  content: { message: string; originalError?: unknown; code: ErrorCode };
}
export interface WithMetadataErrorEvent extends ErrorEvent {
  metadata: Model;
}

export type FinishEvent = CompletionEvent | ErrorEvent;
export type WithMetadataFinishEvent =
  | WithMetadataCompletionEvent
  | WithMetadataErrorEvent;

export type StreamEvent =
  | ResponseIdEvent
  | TextDeltaEvent
  | TextGeneratedEvent
  | ReasoningDeltaEvent
  | ReasoningGeneratedEvent
  | ToolCallDeltaEvent
  | ToolCallRequestEvent
  | TokenUsageEvent
  | FinishEvent;

export type WithMetadataStreamEvent =
  | WithMetadataResponseIdEvent
  | WithMetadataTextDeltaEvent
  | WithMetadataTextGeneratedEvent
  | WithMetadataReasoningDeltaEvent
  | WithMetadataReasoningGeneratedEvent
  | WithMetadataToolCallDeltaEvent
  | WithMetadataToolCallRequestEvent
  | WithMetadataTokenUsageEvent
  | WithMetadataCompletionEvent
  | WithMetadataErrorEvent;

export const ERROR_CODES = [
  "refusal",
  "unknown",
  "incomplete",
  "unexpected",
  "unsupported",
  "unhandled",
  "empty_stream",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
