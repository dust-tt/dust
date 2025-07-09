import type { FunctionCallType } from "@app/types/assistant/generation";

export type TextContentType = {
  type: "text_content";
  value: string;
};

export type ReasoningContentType = {
  type: "reasoning";
  value: {
    reasoning?: string;
    metadata: string;
  };
};

export type FunctionCallContentType = {
  type: "function_call";
  value: FunctionCallType;
};

export type AgentContentItemType =
  | TextContentType
  | ReasoningContentType
  | FunctionCallContentType;

export function isTextContent(
  content: AgentContentItemType
): content is TextContentType {
  return content.type === "text_content";
}

export function isReasoningContent(
  content: AgentContentItemType
): content is ReasoningContentType {
  return content.type === "reasoning";
}

export function isFunctionCallContent(
  content: AgentContentItemType
): content is FunctionCallContentType {
  return content.type === "function_call";
}
