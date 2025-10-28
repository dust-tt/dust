import type { ModelId, ModelProviderIdType } from "@app/types";
import type {
  FunctionCallType,
  TextContent,
} from "@app/types/assistant/generation";

export type ReasoningContent = {
  type: "reasoning";
  value: {
    reasoning?: string;
    metadata: string;
    tokens: number;
    provider: ModelProviderIdType;
    region?: string | null;
  };
};

export type FunctionCallContent = {
  type: "function_call";
  value: FunctionCallType;
};

export type ErrorContent = {
  type: "error";
  value: {
    code: string;
    message: string;
    metadata: Record<string, string | number | boolean> | null;
  };
};

export type AgentContent =
  | TextContent
  | ReasoningContent
  | FunctionCallContent
  | ErrorContent;

export function isTextContent(content: AgentContent): content is TextContent {
  return content.type === "text";
}

export function isReasoningContent(
  content: AgentContent
): content is ReasoningContent {
  return content.type === "reasoning";
}

export function isFunctionCallContent(
  content: AgentContent
): content is FunctionCallContent {
  return content.type === "function_call";
}

export function isErrorContent(content: AgentContent): content is ErrorContent {
  return content.type === "error";
}

export type AgentStepContentType = {
  id: ModelId;
  sId: string;
  createdAt: number;
  updatedAt: number;
  agentMessageId: ModelId;
  step: number;
  index: number;
  version: number;
  type: AgentContent["type"];
  value: AgentContent;
};
