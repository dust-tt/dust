import type { ResponseInput } from "openai/resources/responses/responses.mjs";

export const inputMessages: ResponseInput = [
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
    call_id: "DdHr7L197",
    name: "web_search_browse__websearch",
    arguments: '{"query":"Paris France weather forecast October 23 2025"}',
  },
  {
    type: "function_call_output",
    output:
      '[{"type":"resource","resource":{"uri":"https://www.weather25.com"}}]',
    call_id: "DdHr7L197",
  },
];
