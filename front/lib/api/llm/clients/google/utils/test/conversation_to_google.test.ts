import { toContent } from "@app/lib/api/llm/clients/google/utils/conversation_to_google";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";
import { GEMINI_2_5_PRO_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import { trustedFetchImageBase64 } from "@app/types/shared/utils/image_utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/types/shared/utils/image_utils");

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

describe("image_url handling", () => {
  it("should return a text part fallback when image fetch fails in user message", async () => {
    vi.mocked(trustedFetchImageBase64).mockRejectedValue(
      new Error("Not Found")
    );

    const result = await toContent(
      {
        role: "user",
        name: "Someone",
        content: [
          {
            type: "image_url",
            image_url: { url: "https://example.com/expired.png" },
          },
        ],
      },
      GEMINI_2_5_PRO_MODEL_ID
    );

    expect(result).toEqual({
      role: "user",
      parts: [{ text: "Attachment: image could not be loaded." }],
    });
  });

  it("should return a text fallback when image fetch fails in tool result", async () => {
    vi.mocked(trustedFetchImageBase64).mockRejectedValue(
      new Error("Not Found")
    );

    const result = await toContent(
      {
        role: "function",
        name: "some_tool",
        function_call_id: "call_1",
        content: [
          {
            type: "image_url",
            image_url: { url: "https://example.com/expired.png" },
          },
        ],
      },
      GEMINI_2_5_PRO_MODEL_ID
    );

    expect(result).toEqual({
      role: "user",
      parts: [
        {
          functionResponse: {
            response: { output: "Attachment: image could not be loaded." },
            name: "some_tool",
            id: "call_1",
          },
        },
      ],
    });
  });

  it("should embed image as base64 when fetch succeeds in user message", async () => {
    vi.mocked(trustedFetchImageBase64).mockResolvedValue({
      mediaType: "image/jpeg",
      data: "base64data",
    });

    const result = await toContent(
      {
        role: "user",
        name: "Someone",
        content: [
          {
            type: "image_url",
            image_url: { url: "https://example.com/image.jpg" },
          },
        ],
      },
      GEMINI_2_5_PRO_MODEL_ID
    );

    expect(result).toEqual({
      role: "user",
      parts: [{ inlineData: { mimeType: "image/jpeg", data: "base64data" } }],
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
