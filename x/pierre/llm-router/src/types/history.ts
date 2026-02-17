import type {
  WithMetadataReasoningGeneratedEvent,
  WithMetadataTextGeneratedEvent,
  WithMetadataToolCallRequestEvent,
  WithMetadataToolCallResultEvent,
} from "@/types/output";

export const payload = {};

export type UserMessage = UserTextMessage | ToolCallResultMessage;

export type AssistantMessage =
  | AssistantTextMessage
  | AssistantReasoningMessage
  | AssistantToolCallRequestMessage;

export type Message = UserMessage | AssistantMessage;

export type Conversation = {
  system: SystemTextMessage[];
  messages: Message[];
};

export type SystemTextMessage = {
  role: "system";
  type: "text";
  content: { value: string };
};
export type UserTextMessage = {
  role: "user";
  type: "text";
  content: { value: string };
};
export type AssistantTextMessage = {
  role: "assistant";
  type: "text";
  content: { value: string };
  metadata?: WithMetadataTextGeneratedEvent;
};
export type AssistantReasoningMessage = {
  role: "assistant";
  type: "reasoning";
  content: { value: string };
  metadata?: WithMetadataReasoningGeneratedEvent["metadata"];
};

export type AssistantToolCallRequestMessage = {
  role: "assistant";
  type: "tool_call_request";
  content: {
    toolName: string;
    arguments: string;
  };
  metadata?: WithMetadataToolCallRequestEvent["metadata"];
};

export type ToolCallResultMessage = {
  role: "user";
  type: "tool_call_result";
  content: {
    outputJson: string;
    isError: boolean;
  };
  metadata?: WithMetadataToolCallResultEvent["metadata"];
};

export type Payload = {
  conversation: Conversation;
};
