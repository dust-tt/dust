import { describe, expect, it } from "vitest";

import { toMessage } from "@app/lib/api/llm/clients/anthropic/utils/conversation_to_anthropic";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types";

describe("toMessage", () => {
  describe("user messages", () => {
    it("should convert user message with text and function calls.", () => {
      const messages = conversationMessages.map(toMessage);

      expect(messages).toEqual(inputMessages);
    });
  });
});

const conversationMessages: ModelMessageTypeMultiActionsWithoutContentFragment[] =
  [
    {
      role: "user",
      name: "John Smith",
      content: [
        {
          type: "text",
          text: "Hello there!",
        },
      ],
    },
    {
      role: "assistant",
      function_calls: [
        {
          id: "DdHr7L197",
          name: "web_search_browse__websearch",
          arguments:
            '{"query":"Paris France weather forecast October 23 2025"}',
        },
      ],
      content: "### response.",
      contents: [
        {
          type: "text_content",
          value: "### response.",
        },
        {
          type: "function_call",
          value: {
            id: "DdHr7L197",
            name: "web_search_browse__websearch",
            arguments:
              '{"query":"Paris France weather forecast October 23 2025"}',
          },
        },
      ],
    },
    {
      role: "function",
      name: "web_search_browse__websearch",
      function_call_id: "DdHr7L197",
      content:
        '[{"type":"resource","resource":{"uri":"https://www.weather25.com"}}]',
    },
  ];

const inputMessages = [
  {
    role: "user",
    content: [
      {
        type: "text",
        text: "Hello there!",
      },
    ],
  },
  {
    role: "assistant",
    content: [
      {
        type: "text",
        text: "### response.",
      },
      {
        type: "tool_use",
        id: "DdHr7L197",
        name: "web_search_browse__websearch",
        input: JSON.parse(
          '{"query":"Paris France weather forecast October 23 2025"}'
        ),
      },
    ],
  },
  {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "DdHr7L197",
        content:
          '[{"type":"resource","resource":{"uri":"https://www.weather25.com"}}]',
      },
    ],
  },
];
