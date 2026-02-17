import type { Payload } from "@/types/history";

export const query: Payload = {
  conversation: {
    messages: [
      {
        role: "user",
        type: "text",
        content: { value: "What is the weather in Paris, France?" },
      },
    ],
  },
  systemPrompt: {
    value: "What is the weather in Paris, France?",
  },
};
