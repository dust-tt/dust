import type { ModelId, ModelProviderIdType } from "@app/types";
import type {
  FunctionCallType,
  TextContent,
} from "@app/types/assistant/generation";

export type ReasoningContentType = {
  type: "reasoning";
  value: {
    reasoning?: string;
    metadata: string;
    tokens: number;
    provider: ModelProviderIdType;
    region?: string | null;
  };
};

export type FunctionCallContentType = {
  type: "function_call";
  value: FunctionCallType;
};

export type ErrorContentType = {
  type: "error";
  value: {
    code: string;
    message: string;
    metadata: Record<string, string | number | boolean> | null;
  };
};

export type AgentContentItemType =
  | TextContent
  | ReasoningContentType
  | FunctionCallContentType
  | ErrorContentType;

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

export function isErrorContent(
  content: AgentContentItemType
): content is ErrorContentType {
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
  type: AgentContentItemType["type"];
  value: AgentContentItemType;
};
