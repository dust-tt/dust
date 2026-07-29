import type { PassthroughLab } from "@app/lib/model_constructors/types/output/events";
import type { Phase } from "@app/lib/model_constructors/types/phases";

const CACHE_OPTIONS = ["short", "long"] as const;
export type CacheOption = (typeof CACHE_OPTIONS)[number];

export type BaseUserTextMessage = {
  role: "user";
  type: "text";
  content: { value: string };
  cache?: CacheOption;
};

export type BaseUserImageMessage = {
  role: "user";
  type: "image_url";
  content: { url: string };
  cache?: CacheOption;
};

export type ToolCallResultTextPart = { type: "text"; text: string };
export type ToolCallResultImagePart = { type: "image_url"; url: string };
export type ToolCallResultPart =
  | ToolCallResultTextPart
  | ToolCallResultImagePart;

export type BaseToolCallResultMessage = {
  role: "user";
  type: "tool_call_result";
  content: {
    callId: string;
    toolName: string;
    parts: ToolCallResultPart[];
    isError: boolean;
  };
  cache?: CacheOption;
};

export type BaseUserMessage =
  | BaseUserTextMessage
  | BaseUserImageMessage
  | BaseToolCallResultMessage;

export type BaseAssistantTextMessage = {
  role: "assistant";
  type: "text";
  content: { value: string };
  // Responses API commentary/final_answer phase, resent verbatim on replay
  // (OpenAI recommends preserving it; dropping it degrades quality on
  // gpt-5.3-codex and beyond).
  phase?: Phase;
};

export type BaseAssistantReasoningMessage = {
  role: "assistant";
  type: "reasoning";
  content: { value: string };
  // The original reasoning item id, used to key the replayed item.
  signature?: string;
  // OpenAI encrypted reasoning content, resent alongside the id on replay.
  encryptedContent?: string;
};

export type BaseAssistantToolCallRequestMessage = {
  role: "assistant";
  type: "tool_call_request";
  content: {
    callId: string;
    toolName: string;
    arguments: string;
    namespace?: string;
  };
  signature?: string;
};

// Opaque, provider-specific block carried verbatim so the producing provider
// can replay it. Every other consumer skips it. The block is kept opaque here.
export type BaseAssistantProviderPassthroughMessage = {
  role: "assistant";
  type: "provider_passthrough";
  content: {
    provider: PassthroughLab;
    block: unknown;
  };
};

export type BaseAssistantMessage =
  | BaseAssistantTextMessage
  | BaseAssistantReasoningMessage
  | BaseAssistantToolCallRequestMessage
  | BaseAssistantProviderPassthroughMessage;

export type BaseMessage = BaseUserMessage | BaseAssistantMessage;

export type SystemTextMessage = {
  role: "system";
  type: "text";
  content: { value: string };
  cache?: CacheOption;
};

export type BaseConversation = {
  system: SystemTextMessage[];
  messages: BaseMessage[];
};

export type Payload = {
  conversation: BaseConversation;
};
