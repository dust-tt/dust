import {
  WithMetadataReasoningGeneratedEvent,
  WithMetadataTextGeneratedEvent,
} from "@/types/output";

export const payload = {};

export type Message = UserTextMessage | AssistantMessage;

export type AssistantMessage = AssistantTextMessage | AssistantReasoningMessage;

export type Conversation = {
  messages: Message[];
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

export type Prompt = {
  value: string;
};

export type Payload = { conversation: Conversation; prompt: Prompt };
