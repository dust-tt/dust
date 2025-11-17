import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types";

export const reasoningConversationMessages: ModelMessageTypeMultiActionsWithoutContentFragment[] =
  [
    {
      role: "user",
      name: "John Smith",
      content: [
        {
          type: "text",
          text: "Solve x^2 + 2x + 1 = 0",
        },
      ],
    },
    {
      role: "assistant",
      function_calls: [],
      content:
        "**Solving the Equation**\n\nI need to solve x^2 + 2x + 1 = 0.\n\n\n\nThe equation x² + 2x + 1 = 0 factors as (x + 1)² = 0, giving x = -1.",
      contents: [
        {
          type: "reasoning",
          value: {
            reasoning:
              "**Solving the Equation**\n\nI need to solve x^2 + 2x + 1 = 0.\n\n",
            metadata: '{"encrypted_content":""}',
            tokens: 180,
            provider: "anthropic" as const,
          },
        },
        {
          type: "text_content",
          value:
            "The equation x² + 2x + 1 = 0 factors as (x + 1)² = 0, giving x = -1.",
        },
      ],
    },
  ];
