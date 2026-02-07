import type {
  WithMetadataReasoningGeneratedEvent,
  WithMetadataTextGeneratedEvent,
  WithMetadataToolCallRequestEvent,
} from "@/types/output";

export const payload = {};

export type UserMessage = UserTextMessage | ToolCallResultMessage;

export type AssistantMessage =
  | AssistantTextMessage
  | AssistantReasoningMessage
  | AssistantToolCallRequestMessage;

export type Message = SystemTextMessage | UserMessage | AssistantMessage;

export type Conversation = {
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
    toolCallId: string;
    arguments: string;
  };
  metadata?: WithMetadataToolCallRequestEvent["metadata"];
};

export type ToolCallResultMessage = {
  role: "user";
  type: "tool_call_result";
  content: {
    toolCallId: string;
    outputJson: string;
    isError: boolean;
  };
};

export type Prompt = {
  value: string;
};

export type Payload = { conversation: Conversation; systemPrompt: Prompt };
