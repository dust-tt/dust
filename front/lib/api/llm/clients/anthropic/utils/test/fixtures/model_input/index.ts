import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.mjs";

export const inputMessages: MessageParam[] = [
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
