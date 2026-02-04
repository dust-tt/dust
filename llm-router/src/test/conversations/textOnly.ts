import type { Payload } from "@/types/payload";

export const payload: Payload = {
  conversation: {
    messages: [
      {
        role: "system",
        content: { value: 'Say "hi"' },
      },
    ],
  },
  prompt: {
    value: "Do what you're asked to.",
  },
};
