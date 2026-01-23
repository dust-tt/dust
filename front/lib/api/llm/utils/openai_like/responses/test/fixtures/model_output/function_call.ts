import type { ResponseStreamEvent } from "openai/resources/responses/responses";

// OpenAI sends more data than ResponseStreamEvent
export const functionCallModelEvents: ResponseStreamEvent[] = [
  {
    type: "response.output_item.added",
    output_index: 0,
    sequence_number: 1,
    item: {
      id: "fc_06aabf29f7da2e13016901cef49d6881989055afd74ea35208",
      type: "function_call",
      status: "in_progress",
      arguments: "",
      call_id: "call_TNG5uqSoWvdMD4MFV6wKCwZT",
      name: "common_utilities__math_operation",
    },
  },
  {
    type: "response.function_call_arguments.delta",
    item_id: "fc_06aabf29f7da2e13016901cef49d6881989055afd74ea35208",
    output_index: 0,
    sequence_number: 2,
    // Chunks are much smaller
    delta: '{"expression":',
  },
  {
    type: "response.function_call_arguments.delta",
    sequence_number: 3,
    item_id: "fc_06aabf29f7da2e13016901cef49d6881989055afd74ea35208",
    output_index: 0,
    delta: '"x^2 + 2x + 1 = 0"}',
  },
  {
    type: "response.function_call_arguments.done",
    name: "common_utilities__math_operation",
    sequence_number: 4,
    item_id: "fc_06aabf29f7da2e13016901cef49d6881989055afd74ea35208",
    output_index: 0,
    arguments: '{"expression":"x^2 + 2x + 1 = 0"}',
  },
  {
    type: "response.output_item.done",
    sequence_number: 5,
    output_index: 0,
    item: {
      id: "fc_06aabf29f7da2e13016901cef49d6881989055afd74ea35208",
      type: "function_call",
      status: "completed",
      arguments: '{"expression":"x^2 + 2x + 1 = 0"}',
      call_id: "call_TNG5uqSoWvdMD4MFV6wKCwZT",
      name: "common_utilities__math_operation",
    },
  },
  {
    type: "response.output_item.added",
    sequence_number: 6,
    output_index: 1,
    item: {
      id: "fc_06aabf29f7da2e13016901cef549108198b49dc352fc8889ff",
      type: "function_call",
      status: "in_progress",
      arguments: "",
      call_id: "call_XoBlcEPygqXN28I2McKpLSfF",
      name: "web_search_browse__websearch",
    },
  },
  {
    type: "response.function_call_arguments.delta",
    sequence_number: 7,
    item_id: "fc_06aabf29f7da2e13016901cef549108198b49dc352fc8889ff",
    output_index: 1,
    delta: '{"query":"weather forecast ',
    // obfuscation: "lKIHGy8q40VF7UY",
  },
  {
    type: "response.function_call_arguments.delta",
    sequence_number: 8,
    item_id: "fc_06aabf29f7da2e13016901cef549108198b49dc352fc8889ff",
    output_index: 1,
    delta: 'Paris France tomorrow","page":1}',
    // obfuscation: "wUO97epRvz",
  },
  {
    type: "response.function_call_arguments.done",
    sequence_number: 9,
    item_id: "fc_06aabf29f7da2e13016901cef549108198b49dc352fc8889ff",
    name: "web_search_browse__websearch",
    output_index: 1,
    arguments: '{"query":"weather forecast Paris France tomorrow","page":1}',
  },
  {
    type: "response.output_item.done",
    sequence_number: 10,
    output_index: 1,
    item: {
      id: "fc_06aabf29f7da2e13016901cef549108198b49dc352fc8889ff",
      type: "function_call",
      status: "completed",
      arguments: '{"query":"weather forecast Paris France tomorrow","page":1}',
      call_id: "call_XoBlcEPygqXN28I2McKpLSfF",
      name: "web_search_browse__websearch",
    },
  },
  {
    type: "response.completed",
    sequence_number: 37,
    // @ts-expect-error broke open ai types
    response: {
      id: "resp_06aabf29f7da2e13016901cef2a8d081988d7ac3e83b297884",
      object: "response",
      created_at: 1761726194,
      status: "completed",
      //   background: false,
      error: null,
      incomplete_details: null,
      instructions: null,
      max_output_tokens: null,
      //   max_tool_calls: null,
      model: "gpt-4.1-2025-04-14",
      output: [
        {
          id: "fc_06aabf29f7da2e13016901cef49d6881989055afd74ea35208",
          type: "function_call",
          status: "completed",
          arguments: '{"expression":"x^2 + 2x + 1 = 0"}',
          call_id: "call_TNG5uqSoWvdMD4MFV6wKCwZT",
          name: "common_utilities__math_operation",
        },
        {
          id: "fc_06aabf29f7da2e13016901cef549108198b49dc352fc8889ff",
          type: "function_call",
          status: "completed",
          arguments:
            '{"query":"weather forecast Paris France tomorrow","page":1}',
          call_id: "call_XoBlcEPygqXN28I2McKpLSfF",
          name: "web_search_browse__websearch",
        },
      ],
      parallel_tool_calls: true,
      previous_response_id: null,
      //   prompt_cache_key: null,
      reasoning: {
        effort: null,
        summary: null,
      },
      //   safety_identifier: null,
      service_tier: "default",
      //   store: false,
      temperature: 0.7,
      text: {
        format: {
          type: "text",
        },
        // verbosity: "medium",
      },
      tool_choice: "auto",
      tools: [
        // Some tools
      ],
      //   top_logprobs: 0,
      top_p: 1,
      truncation: "disabled",
      usage: {
        input_tokens: 1391,
        input_tokens_details: {
          cached_tokens: 0,
        },
        output_tokens: 74,
        output_tokens_details: {
          reasoning_tokens: 0,
        },
        total_tokens: 1465,
      },
      //   user: null,
      metadata: {},
    },
  },
];
