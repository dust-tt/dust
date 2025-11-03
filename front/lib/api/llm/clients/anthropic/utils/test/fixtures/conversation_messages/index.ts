import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types";

export const conversationMessages: ModelMessageTypeMultiActionsWithoutContentFragment[] =
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
