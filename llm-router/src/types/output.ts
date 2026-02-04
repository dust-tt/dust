import type {
  OpenAIResponseIdMetadata,
  OpenAITextDeltaMetadata,
  OpenAITextGeneratedMetadata,
} from "@/providers/openai/provider";
import type { Model } from "@/types/model";
import type { Value } from "@/types/utils";

type TextDeltaEventMetadata = OpenAITextDeltaMetadata;
type TextGeneratedEventMetadata = OpenAITextGeneratedMetadata;
type ResponseIdEventMetadata = OpenAIResponseIdMetadata;

export interface ResponseIdEvent {
  type: "interaction_id";
  content: { id: string };
}
export interface WithMetadataResponseIdEvent extends ResponseIdEvent {
  metadata: ResponseIdEventMetadata;
}

export interface TextDeltaEvent {
  type: "text_delta";
  content: Value<string>;
}
export interface WithMetadataTextDeltaEvent extends TextDeltaEvent {
  metadata: TextDeltaEventMetadata;
}

export interface TextGeneratedEvent {
  type: "text_generated";
  content: Value<string>;
}
export interface WithMetadataTextGeneratedEvent extends TextGeneratedEvent {
  metadata: TextGeneratedEventMetadata;
}

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
  content: { textGenerated: TextGeneratedEvent; responseId: ResponseIdEvent };
}
export interface WithMetadataCompletionEvent extends CompletionEvent {
  metadata: Model;
}

export interface ErrorEvent {
  type: "error";
  content: { message: Value<string>; originalError?: unknown; code: ErrorCode };
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
  | TokenUsageEvent
  | FinishEvent;

export type WithMetadataStreamEvent =
  | WithMetadataResponseIdEvent
  | WithMetadataTextDeltaEvent
  | WithMetadataTextGeneratedEvent
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
