import type { ModelId, ModelProviderIdType } from "@app/types";
import type { FunctionCallType } from "@app/types/assistant/generation";

export type AgentTextContentType = {
  type: "text_content";
  value: string;
};

export type AgentReasoningContentType = {
  type: "reasoning";
  value: {
    reasoning?: string;
    metadata: string;
    tokens: number;
    provider: ModelProviderIdType;
    region?: string | null;
  };
};

export type AgentFunctionCallContentType = {
  type: "function_call";
  value: FunctionCallType;
};

export type AgentErrorContentType = {
  type: "error";
  value: {
    code: string;
    message: string;
    metadata: Record<string, string | number | boolean> | null;
  };
};

export type AgentContentItemType =
  | AgentTextContentType
  | AgentReasoningContentType
  | AgentFunctionCallContentType
  | AgentErrorContentType;

export function isAgentTextContent(
  content: AgentContentItemType
): content is AgentTextContentType {
  return content.type === "text_content";
}

export function isAgentReasoningContent(
  content: AgentContentItemType
): content is AgentReasoningContentType {
  return content.type === "reasoning";
}

export function isAgentFunctionCallContent(
  content: AgentContentItemType
): content is AgentFunctionCallContentType {
  return content.type === "function_call";
}

function isAgentErrorContent(
  content: AgentContentItemType
): content is AgentErrorContentType {
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
