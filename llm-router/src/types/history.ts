export const payload = {};

export type Message = {
  role: "user" | "assistant" | "system";
  content: { value: string };
};

export type Conversation = {
  messages: Message[];
};

export type Prompt = {
  value: string;
};

export type Payload = { conversation: Conversation; prompt: Prompt };
