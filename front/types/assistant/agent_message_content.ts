import type { FunctionCallType } from "@app/types/assistant/generation";

export type TextContentType = {
  type: "text_content";
  value: string;
};

export type ReasoningContentType = {
  type: "reasoning";
  value: {
    displayableText?: string;
    metadata: string;
  };
};

export type FunctionCallContentType = {
  type: "function_call";
  value: FunctionCallType;
};

export type AssistantContentItemType =
  | TextContentType
  | ReasoningContentType
  | FunctionCallContentType;

export function isTextContent(
  content: AssistantContentItemType
): content is TextContentType {
  return content.type === "text_content";
}

export function isReasoningContent(
  content: AssistantContentItemType
): content is ReasoningContentType {
  return content.type === "reasoning";
}

export function isFunctionCallContent(
  content: AssistantContentItemType
): content is FunctionCallContentType {
  return content.type === "function_call";
}
