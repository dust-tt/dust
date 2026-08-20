export type BaseUserTextMessage = {
  role: "user";
  type: "text";
  content: { value: string };
};
export type BaseUserImageMessage = {
  role: "user";
  type: "image_url";
  content: { url: string };
};
export type BaseToolCallResultMessage = {
  role: "user";
  type: "tool_call_result";
  content: {
    value: string;
    isError: boolean;
  };
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
};

export type BaseAssistantToolCallRequestMessage = {
  role: "assistant";
  type: "tool_call_request";
  content: {
    toolName: string;
    arguments: string;
  };
};

export type BaseAssistantMessage =
  | BaseAssistantTextMessage
  | BaseAssistantReasoningMessage
  | BaseAssistantToolCallRequestMessage;

export type BaseMessage = BaseUserMessage | BaseAssistantMessage;

export type SystemTextMessage = {
  role: "system";
  type: "text";
  content: { value: string };
};

export type BaseConversation = {
  system: SystemTextMessage[];
  messages: BaseMessage[];
};

export type Payload = {
  conversation: BaseConversation;
};
