import type { Payload } from "@/types/history";

export const payload: Payload = {
  conversation: {
    messages: [
      {
        role: "system",
        content: { value: "Assistant" },
      },
    ],
  },
  prompt: {
    value: "Hi",
  },
};
