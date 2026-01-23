import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.mjs";

export const reasoningInputMessages: MessageParam[] = [
  {
    role: "user",
    content: [
      {
        type: "text",
        text: "Solve x^2 + 2x + 1 = 0",
      },
    ],
  },
  {
    role: "assistant",
    content: [
      {
        type: "thinking",
        thinking:
          "**Solving the Equation**\n\nI need to solve x^2 + 2x + 1 = 0.\n\n",
        signature: "",
      },
      {
        type: "text",
        text: "The equation x² + 2x + 1 = 0 factors as (x + 1)² = 0, giving x = -1.",
      },
    ],
  },
];
