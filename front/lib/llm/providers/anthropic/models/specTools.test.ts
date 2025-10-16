import { conversationToAnthropicInput } from "@app/lib/llm/providers/anthropic/models/specTools";

const testInput = {
  messages: [
    {
      role: "assistant" as const,
      function_calls: [
        {
          id: "call_jOv7F0537S1MvH92pMTQBU62",
          name: "web_search_browse__websearch",
          arguments: '{"query":"weather forecast Paris tomorrow"}',
        },
      ],
      content: "",
      contents: [
        {
          type: "function_call" as const,
          value: {
            id: "call_jOv7F0537S1MvH92pMTQBU62",
            name: "web_search_browse__websearch",
            arguments: '{"query":"weather forecast Paris tomorrow"}',
          },
        },
      ],
    },
  ],
};

const result = conversationToAnthropicInput(testInput);
console.log("Anthropic Result:");
console.log(JSON.stringify(result, null, 2));