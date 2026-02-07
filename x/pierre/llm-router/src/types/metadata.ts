import type {
  AnthropicCompletionMetadata,
  AnthropicReasoningDeltaMetadata,
  AnthropicReasoningGeneratedMetadata,
  AnthropicResponseIdMetadata,
  AnthropicTextDeltaMetadata,
  AnthropicTextGeneratedMetadata,
  AnthropicToolCallDeltaMetadata,
  AnthropicToolCallGeneratedMetadata,
  AnthropicToolCallRequestMetadata,
  AnthropicToolCallResultMetadata,
} from "@/providers/anthropic/types";
import type {
  OpenAICompletionMetadata,
  OpenAIReasoningDeltaMetadata,
  OpenAIReasoningGeneratedMetadata,
  OpenAIResponseIdMetadata,
  OpenAITextDeltaMetadata,
  OpenAITextGeneratedMetadata,
  OpenAIToolCallDeltaMetadata,
  OpenAIToolCallGeneratedMetadata,
  OpenAIToolCallRequestMetadata,
  OpenAIToolCallResultMetadata,
} from "@/providers/openai/types";

export type TextDeltaEventMetadata =
  | OpenAITextDeltaMetadata
  | AnthropicTextDeltaMetadata;
export type TextGeneratedEventMetadata =
  | OpenAITextGeneratedMetadata
  | AnthropicTextGeneratedMetadata;
export type ReasoningDeltaEventMetadata =
  | OpenAIReasoningDeltaMetadata
  | AnthropicReasoningDeltaMetadata;
export type ReasoningGeneratedEventMetadata =
  | OpenAIReasoningGeneratedMetadata
  | AnthropicReasoningGeneratedMetadata;
export type ResponseIdEventMetadata =
  | OpenAIResponseIdMetadata
  | AnthropicResponseIdMetadata;
export type CompletionEventMetadata =
  | OpenAICompletionMetadata
  | AnthropicCompletionMetadata;
export type ToolCallRequestEventMetadata =
  | OpenAIToolCallRequestMetadata
  | AnthropicToolCallRequestMetadata;
export type ToolCallArgumentsDeltaEventMetadata =
  | OpenAIToolCallDeltaMetadata
  | AnthropicToolCallDeltaMetadata;
export type ToolCallGeneratedEventMetadata =
  | OpenAIToolCallGeneratedMetadata
  | AnthropicToolCallGeneratedMetadata;
export type ToolCallResultEventMetadata =
  | OpenAIToolCallResultMetadata
  | AnthropicToolCallResultMetadata;
