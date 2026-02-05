import type {
  OpenAICompletionMetadata,
  OpenAIReasoningDeltaMetadata,
  OpenAIReasoningGeneratedMetadata,
  OpenAIResponseIdMetadata,
  OpenAITextDeltaMetadata,
  OpenAITextGeneratedMetadata,
} from "@/providers/openai/types";
import type { Model } from "@/types/model";

type TextDeltaEventMetadata = OpenAITextDeltaMetadata;
type TextGeneratedEventMetadata = OpenAITextGeneratedMetadata;
type ReasoningDeltaEventMetadata = OpenAIReasoningDeltaMetadata;
type ReasoningGeneratedEventMetadata = OpenAIReasoningGeneratedMetadata;
type ResponseIdEventMetadata = OpenAIResponseIdMetadata;
type CompletionEventMetadata = OpenAICompletionMetadata;

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

export type OutputEvent = ReasoningGeneratedEvent | TextGeneratedEvent;
export type WithMetadataOutputEvent =
  | WithMetadataResponseIdEvent
  | WithMetadataReasoningGeneratedEvent
  | WithMetadataTextGeneratedEvent;

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
  | TokenUsageEvent
  | FinishEvent;

export type WithMetadataStreamEvent =
  | WithMetadataResponseIdEvent
  | WithMetadataTextDeltaEvent
  | WithMetadataTextGeneratedEvent
  | WithMetadataReasoningDeltaEvent
  | WithMetadataReasoningGeneratedEvent
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
