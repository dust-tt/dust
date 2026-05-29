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
export type BaseToolCallResultMessage = {
  role: "user";
  type: "tool_call_result";
  content: {
    callId: string;
    value: string;
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
};
export type BaseAssistantReasoningMessage = {
  role: "assistant";
  type: "reasoning";
  content: { value: string };
  signature?: string;
};

export type BaseAssistantToolCallRequestMessage = {
  role: "assistant";
  type: "tool_call_request";
  content: {
    callId: string;
    toolName: string;
    arguments: string;
  };
};

export type BaseAssistantMessage =
  | BaseAssistantTextMessage
  | BaseAssistantReasoningMessage
  | BaseAssistantToolCallRequestMessage;

export type BaseMessage = BaseUserMessage | BaseAssistantMessage;

const CACHE_OPTIONS = ["short", "long"] as const;
export type CacheOption = (typeof CACHE_OPTIONS)[number];

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
