import type { LLMEvent } from "@app/lib/api/llm/types/events";

export const functionCallLLMEvents: LLMEvent[] = [
  {
    type: "tool_call",
    content: {
      id: "call_TNG5uqSoWvdMD4MFV6wKCwZT",
      name: "common_utilities__math_operation",
      arguments: { expression: "x^2 + 2x + 1 = 0" },
    },
    metadata: {
      clientId: "openai_responses",
      modelId: "gpt-5",
    },
  },
  {
    type: "tool_call",
    content: {
      id: "call_XoBlcEPygqXN28I2McKpLSfF",
      name: "web_search_browse__websearch",
      arguments: { query: "weather forecast Paris France tomorrow", page: 1 },
    },
    metadata: {
      clientId: "openai_responses",
      modelId: "gpt-5",
    },
  },
  {
    type: "token_usage",
    content: {
      inputTokens: 1391,
      cachedTokens: 0,
      reasoningTokens: 0,
      outputTokens: 74,
      totalTokens: 1465,
    },
    metadata: {
      clientId: "openai_responses",
      modelId: "gpt-5",
    },
  },
  {
    type: "success",
    aggregated: [
      {
        type: "tool_call",
        content: {
          id: "call_TNG5uqSoWvdMD4MFV6wKCwZT",
          name: "common_utilities__math_operation",
          arguments: { expression: "x^2 + 2x + 1 = 0" },
        },
        metadata: {
          clientId: "openai_responses",
          modelId: "gpt-5",
        },
      },
      {
        type: "tool_call",
        content: {
          id: "call_XoBlcEPygqXN28I2McKpLSfF",
          name: "web_search_browse__websearch",
          arguments: {
            query: "weather forecast Paris France tomorrow",
            page: 1,
          },
        },
        metadata: {
          clientId: "openai_responses",
          modelId: "gpt-5",
        },
      },
    ],
    toolCalls: [
      {
        type: "tool_call",
        content: {
          id: "call_TNG5uqSoWvdMD4MFV6wKCwZT",
          name: "common_utilities__math_operation",
          arguments: { expression: "x^2 + 2x + 1 = 0" },
        },
        metadata: {
          clientId: "openai_responses",
          modelId: "gpt-5",
        },
      },
      {
        type: "tool_call",
        content: {
          id: "call_XoBlcEPygqXN28I2McKpLSfF",
          name: "web_search_browse__websearch",
          arguments: {
            query: "weather forecast Paris France tomorrow",
            page: 1,
          },
        },
        metadata: {
          clientId: "openai_responses",
          modelId: "gpt-5",
        },
      },
    ],
    metadata: {
      clientId: "openai_responses",
      modelId: "gpt-5",
    },
  },
];
