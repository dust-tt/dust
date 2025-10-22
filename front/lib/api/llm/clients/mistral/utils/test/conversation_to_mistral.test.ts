import { describe, expect, it } from "vitest";

import { toMessage } from "@app/lib/api/llm/clients/mistral/utils/conversation_to_mistral";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types";

describe("toMessage", () => {
  describe("user messages", () => {
    it("should convert user message with text and function calls.", () => {
      const messages = conversationMessages.map((message) =>
        toMessage(message)
      );

      expect(messages).toEqual(inputMessages);
    });
  });
});

const conversationMessages: ModelMessageTypeMultiActionsWithoutContentFragment[] =
  [
    {
      role: "user",
      name: "Pierre Milliotte",
      content: [
        {
          type: "text",
          text: '<attachment id="id" type="image/png" title="title.png" version="latest" isIncludable="true" isQueryable="false" isSearchable="false">[Image content interpreted by a vision-enabled model. Description not available in this context.\n</attachment>',
        },
        {
          type: "text",
          text: "<dust_system>\n- Sender: Pierre Milliotte (@pierre) <pierre@dust.tt>\n- Sent at: Oct 22, 2025, 10:53:44 GMT+2\n- Source: web\n</dust_system>\n\n@test hello",
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
              '{"query": "Paris France weather forecast October 23 2025"}',
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
        text: '<attachment id="id" type="image/png" title="title.png" version="latest" isIncludable="true" isQueryable="false" isSearchable="false">[Image content interpreted by a vision-enabled model. Description not available in this context.\n</attachment>',
      },
      {
        type: "text",
        text: "<dust_system>\n- Sender: Pierre Milliotte (@pierre) <pierre@dust.tt>\n- Sent at: Oct 22, 2025, 10:53:44 GMT+2\n- Source: web\n</dust_system>\n\n@test hello",
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
    ],
    toolCalls: [
      {
        id: "DdHr7L197",
        function: {
          name: "web_search_browse__websearch",
          arguments:
            '{"query": "Paris France weather forecast October 23 2025"}',
        },
      },
    ],
  },
  {
    role: "tool",
    content:
      '[{"type":"resource","resource":{"uri":"https://www.weather25.com"}}]',
    name: "web_search_browse__websearch",
    toolCallId: "DdHr7L197",
  },
];
