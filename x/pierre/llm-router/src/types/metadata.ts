import type {
  OpenAICompletionMetadata,
  OpenAIReasoningDeltaMetadata,
  OpenAIReasoningGeneratedMetadata,
  OpenAIResponseIdMetadata,
  OpenAITextDeltaMetadata,
  OpenAITextGeneratedMetadata,
  OpenAIToolCallDeltaMetadata,
  OpenAIToolCallRequestMetadata,
  OpenAIToolCallResultMetadata,
} from "@/providers/openai/types";

export type TextDeltaEventMetadata = OpenAITextDeltaMetadata;
export type TextGeneratedEventMetadata = OpenAITextGeneratedMetadata;
export type ReasoningDeltaEventMetadata = OpenAIReasoningDeltaMetadata;
export type ReasoningGeneratedEventMetadata = OpenAIReasoningGeneratedMetadata;
export type ResponseIdEventMetadata = OpenAIResponseIdMetadata;
export type CompletionEventMetadata = OpenAICompletionMetadata;
export type ToolCallRequestEventMetadata = OpenAIToolCallRequestMetadata;
export type ToolCallArgumentsDeltaEventMetadata = OpenAIToolCallDeltaMetadata;
export type ToolCallResultEventMetadata = OpenAIToolCallResultMetadata;
