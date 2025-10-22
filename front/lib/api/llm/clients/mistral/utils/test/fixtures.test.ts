import type { CompletionEvent } from "@mistralai/mistralai/models/components";

import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types";

export const conversationMessages: ModelMessageTypeMultiActionsWithoutContentFragment[] =
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

export const inputMessages = [
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

export const modelOutputFinishStopEvents: CompletionEvent[] = [
  {
    data: {
      id: "25b708fd990f4a3b8d6fc7166e4b8db2",
      object: "chat.completion.chunk",
      created: 1761123235,
      model: "mistral-large-latest",
      choices: [
        {
          index: 0,
          delta: {
            content: "Hello, ",
          },
          finishReason: null,
        },
      ],
    },
  },
  {
    data: {
      id: "25b708fd990f4a3b8d6fc7166e4b8db2",
      object: "chat.completion.chunk",
      created: 1761123235,
      model: "mistral-large-latest",
      usage: {
        promptTokens: 3186,
        completionTokens: 192,
        totalTokens: 3378,
      },
      choices: [
        {
          index: 0,
          delta: {
            content: "how are you ?",
          },
          finishReason: "stop",
        },
      ],
    },
  },
];

export const modelOutputFinishToolCallEvents: CompletionEvent[] = [
  {
    data: {
      id: "c02315a0f93e47ba87c64fe6479c219c",
      object: "chat.completion.chunk",
      created: 1761123227,
      model: "mistral-large-latest",
      choices: [
        {
          index: 0,
          delta: {
            content: "Hi !",
          },
          finishReason: null,
        },
      ],
    },
  },
  {
    data: {
      id: "c02315a0f93e47ba87c64fe6479c219c",
      object: "chat.completion.chunk",
      created: 1761123227,
      model: "mistral-large-latest",
      usage: {
        promptTokens: 1766,
        completionTokens: 128,
        totalTokens: 1894,
      },
      choices: [
        {
          index: 0,
          delta: {
            toolCalls: [
              {
                id: "DdHr7L197",
                function: {
                  name: "web_search_browse__websearch",
                  arguments:
                    '{"query": "Paris France weather forecast October 23 2025"}',
                },
                index: 0,
              },
            ],
          },
          finishReason: "tool_calls",
        },
      ],
    },
  },
];

export const metadata = {
  providerId: "mistral" as const,
  modelId: "mistral-large-latest",
};

export const finishStopLLMEvents = [
  {
    type: "text_delta",
    content: {
      delta: "Hello, ",
    },
    metadata,
  },
  {
    type: "text_delta",
    content: {
      delta: "how are you ?",
    },
    metadata,
  },
  {
    type: "text_generated",
    content: {
      text: "Hello, how are you ?",
    },
    metadata,
  },
];

export const finishToolCallLLMEvents = [
  {
    type: "text_delta",
    content: {
      delta: "Hi !",
    },
    metadata,
  },
  {
    type: "text_generated",
    content: {
      text: "Hi !",
    },
    metadata,
  },
  {
    type: "tool_call",
    content: {
      id: "DdHr7L197",
      name: "web_search_browse__websearch",
      arguments: '{"query": "Paris France weather forecast October 23 2025"}',
    },
    metadata,
  },
];
