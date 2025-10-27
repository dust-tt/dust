import { describe, expect, it } from "vitest";

import { toInput } from "@app/lib/api/llm/clients/openai/utils/conversation_to_openai";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types";
import { ResponseInput } from "openai/resources/responses/responses.mjs";

describe("toInput", () => {
  describe("user messages", () => {
    it("should convert user message with text and function calls.", () => {
      const prompt = "You are a helpful assistant.";
      const messages = toInput(prompt, { messages: conversationMessages });

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
          text: "Hello, there!",
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

const inputMessages: ResponseInput = [
  {
    role: "developer",
    content: [
      {
        type: "input_text",
        text: "You are a helpful assistant.",
      },
    ],
  },
  {
    role: "user",
    content: [
      {
        type: "input_text",
        text: "Hello, there!",
      },
    ],
  },
  {
    role: "assistant",
    type: "message",
    content: "### response.",
  },
  {
    type: "function_call",
    id: "fc_DdHr7L197",
    call_id: "call_DdHr7L197",
    name: "web_search_browse__websearch",
    arguments: '{"query":"Paris France weather forecast October 23 2025"}',
  },
  {
    id: "fc_DdHr7L197",
    type: "function_call_output",
    output:
      '[{"type":"resource","resource":{"uri":"https://www.weather25.com"}}]',
    call_id: "call_DdHr7L197",
  },
];
