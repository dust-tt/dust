import { describe, expect, it } from "vitest";

import { toContent } from "@app/lib/api/llm/clients/google/utils/conversation_to_google";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types";
import { GEMINI_2_5_PRO_MODEL_ID } from "@app/types";

describe("toContent", () => {
  describe("user messages", () => {
    it("should convert user message with text and function calls.", async () => {
      const messages = await Promise.all(
        conversationMessages.map((message) =>
          toContent(message, GEMINI_2_5_PRO_MODEL_ID)
        )
      );

      expect(messages).toEqual(expectedGoogleMessages);
    });
  });
});

const conversationMessages: ModelMessageTypeMultiActionsWithoutContentFragment[] =
  [
    {
      role: "user",
      name: "Somebody",
      content: [
        {
          type: "text",
          text: '<attachment id="id" type="image/png" title="title.png" version="latest" isIncludable="true" isQueryable="false" isSearchable="false">[Image content interpreted by a vision-enabled model. Description not available in this context.\n</attachment>',
        },
        {
          type: "text",
          text: "<dust_system>\n- Sender: Somebody (@somebody) <somebody@dust.tt>\n- Sent at: Oct 22, 2025, 10:53:44 GMT+2\n- Source: web\n</dust_system>\n\n@test hello",
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

const expectedGoogleMessages = [
  {
    role: "user",
    parts: [
      {
        text: '<attachment id="id" type="image/png" title="title.png" version="latest" isIncludable="true" isQueryable="false" isSearchable="false">[Image content interpreted by a vision-enabled model. Description not available in this context.\n</attachment>',
      },
      {
        text: "<dust_system>\n- Sender: Somebody (@somebody) <somebody@dust.tt>\n- Sent at: Oct 22, 2025, 10:53:44 GMT+2\n- Source: web\n</dust_system>\n\n@test hello",
      },
    ],
  },
  {
    role: "model",
    parts: [
      {
        text: "### response.",
      },
      {
        functionCall: {
          id: "DdHr7L197",
          name: "web_search_browse__websearch",
          args: {
            query: "Paris France weather forecast October 23 2025",
          },
        },
      },
    ],
  },
  {
    role: "user",
    parts: [
      {
        functionResponse: {
          response: {
            output:
              '[{"type":"resource","resource":{"uri":"https://www.weather25.com"}}]',
          },
          name: "web_search_browse__websearch",
          id: "DdHr7L197",
        },
      },
    ],
  },
];
