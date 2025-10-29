import type { ResponseStreamEvent } from "openai/resources/responses/responses";

export const reasoningModelOutput: ResponseStreamEvent[] = [
  //   {
  //     type: "response.created",
  //   sequence_number: 0,
  //     response: {
  //       id: "resp_06e2b572b276da09016901d7340ee881989921d590530b244e",
  //       // Additional properties omitted for brevity
  //     },
  //   },
  //   {
  //     type: "response.in_progress",
  //   sequence_number: 1,
  //     response: {
  //       id: "resp_06e2b572b276da09016901d7340ee881989921d590530b244e",
  //       // Additional properties omitted for brevity
  //     },
  //   },
  {
    type: "response.output_item.added",
    // sequence_number: 2,
    output_index: 0,
    item: {
      id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
      type: "reasoning",
      summary: [],
    },
  },
  {
    type: "response.reasoning_summary_part.added",
    // sequence_number: 3,
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    summary_index: 0,
    part: {
      type: "summary_text",
      text: "",
    },
  },
  {
    type: "response.reasoning_summary_text.delta",
    // sequence_number: 4,
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    summary_index: 0,
    // Chunks are much smaller
    delta: "**Solving the Equation**\n\nWe need to ",
    // obfuscation: "sg1K64B2gug",
  },
  {
    type: "response.reasoning_summary_text.delta",
    // sequence_number: 5,
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    summary_index: 0,
    delta: "solve the equation.\n\n",
    // obfuscation: "2dVVg93PA8Ed",
  },
  {
    type: "response.reasoning_summary_text.done",
    // sequence_number: 119,
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    summary_index: 0,
    text: "**Solving the Equation**\n\nWe need to solve the equation.\n\n",
  },
  {
    type: "response.reasoning_summary_part.done",
    // sequence_number: 120,
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    summary_index: 0,
    part: {
      type: "summary_text",
      text: "**Solving the Equation**\n\nWe need to solve the equation.\n\n",
    },
  },
  {
    type: "response.reasoning_summary_part.added",
    // sequence_number: 121,
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    summary_index: 1,
    part: {
      type: "summary_text",
      text: "",
    },
  },
  {
    type: "response.reasoning_summary_text.delta",
    // sequence_number: 122,
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    summary_index: 1,
    delta: "**Solving the Quadratic**\n\nTo solve ",
    // obfuscation: "Ca1RD1GfN36",
  },
  {
    type: "response.reasoning_summary_text.delta",
    // sequence_number: 123,
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    summary_index: 1,
    delta: "the equation $$x^2 + 2x + 1 = 0$$, I can factor it...",
    // obfuscation: "FwzpgbaosP87",
  },
  {
    type: "response.reasoning_summary_text.done",
    // sequence_number: 237,
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    summary_index: 1,
    text: "**Solving the Quadratic**\n\nTo solve the equation $$x^2 + 2x + 1 = 0$$, I can factor it...",
  },
  {
    type: "response.reasoning_summary_part.done",
    // sequence_number: 238,
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    summary_index: 1,
    part: {
      type: "summary_text",
      text: "**Solving the Quadratic**\n\nTo solve the equation $$x^2 + 2x + 1 = 0$$, I can factor it...",
    },
  },
  {
    type: "response.output_item.done",
    // sequence_number: 239,
    output_index: 0,
    item: {
      id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
      type: "reasoning",
      summary: [
        {
          type: "summary_text",
          text: "**Solving the Equation**\n\nWe need to solve the equation.\n\n",
        },
        {
          type: "summary_text",
          text: "**Solving the Quadratic**\n\nTo solve the equation $$x^2 + 2x + 1 = 0$$, I can factor it...",
        },
      ],
    },
  },
  {
    type: "response.output_item.added",
    // sequence_number: 240,
    output_index: 1,
    item: {
      id: "msg_06e2b572b276da09016901d73fd5b481988a2e67a253b03e55",
      type: "message",
      status: "in_progress",
      content: [],
      role: "assistant",
    },
  },
  {
    type: "response.content_part.added",
    // sequence_number: 241,
    item_id: "msg_06e2b572b276da09016901d73fd5b481988a2e67a253b03e55",
    output_index: 1,
    content_index: 0,
    part: {
      type: "output_text",
      annotations: [],
      //   logprobs: [],
      text: "",
    },
  },
  {
    type: "response.output_text.delta",
    // sequence_number: 247,
    item_id: "msg_06e2b572b276da09016901d73fd5b481988a2e67a253b03e55",
    output_index: 1,
    content_index: 0,
    delta: "# Solving the equation\n\nGiven:\n$$\nx^2 + 2x + 1 = 0\n",
    // logprobs: [],
    // obfuscation: "ftmpdPEXuF6Hz8",
  },
  {
    type: "response.output_text.delta",
    // sequence_number: 248,
    item_id: "msg_06e2b572b276da09016901d73fd5b481988a2e67a253b03e55",
    output_index: 1,
    content_index: 0,
    delta: "$$\n\nNotice it factors as:\n$$\n(x + 1)^2 = 0\n$$\n\n",
    // logprobs: [],
    // obfuscation: "G3JJxUCkrck",
  },
  {
    type: "response.output_text.done",
    // sequence_number: 330,
    item_id: "msg_06e2b572b276da09016901d73fd5b481988a2e67a253b03e55",
    output_index: 1,
    content_index: 0,
    text: "# Solving the equation\n\nGiven:\n$$\nx^2 + 2x + 1 = 0\n$$\n\nNotice it factors as:\n$$\n(x + 1)^2 = 0\n$$\n\n",
    // logprobs: [],
  },
  {
    type: "response.content_part.done",
    // sequence_number: 331,
    item_id: "msg_06e2b572b276da09016901d73fd5b481988a2e67a253b03e55",
    output_index: 1,
    content_index: 0,
    part: {
      type: "output_text",
      annotations: [],
      //   logprobs: [],
      text: "# Solving the equation\n\nGiven:\n$$\nx^2 + 2x + 1 = 0\n$$\n\nNotice it factors as:\n$$\n(x + 1)^2 = 0\n$$\n\n",
    },
  },
  {
    type: "response.output_item.done",
    // sequence_number: 332,
    output_index: 1,
    item: {
      id: "msg_06e2b572b276da09016901d73fd5b481988a2e67a253b03e55",
      type: "message",
      status: "completed",
      content: [
        {
          type: "output_text",
          annotations: [],
          //   logprobs: [],
          text: "# Solving the equation\n\nGiven:\n$$\nx^2 + 2x + 1 = 0\n$$\n\nNotice it factors as:\n$$\n(x + 1)^2 = 0\n$$\n\n",
        },
      ],
      role: "assistant",
    },
  },
  {
    type: "response.completed",
    // sequence_number: 333,
    // @ts-expect-error broke open ai types
    response: {
      id: "resp_06e2b572b276da09016901d7340ee881989921d590530b244e",
      object: "response",
      created_at: 1761728308,
      status: "completed",
      //   background: false,
      error: null,
      incomplete_details: null,
      instructions: null,
      max_output_tokens: null,
      //   max_tool_calls: null,
      model: "gpt-5-2025-08-07",
      output: [
        {
          id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
          type: "reasoning",
          summary: [
            {
              type: "summary_text",
              text: "**Solving the Equation**\n\nWe need to solve the equation.\n\n",
            },
            {
              type: "summary_text",
              text: "**Solving the Quadratic**\n\nTo solve the equation $$x^2 + 2x + 1 = 0$$, I can factor it...",
            },
          ],
        },
        {
          id: "msg_06e2b572b276da09016901d73fd5b481988a2e67a253b03e55",
          type: "message",
          status: "completed",
          content: [
            {
              type: "output_text",
              annotations: [],
              //   logprobs: [],
              text: "# Solving the equation\n\nGiven:\n$$\nx^2 + 2x + 1 = 0\n$$\n\nNotice it factors as:\n$$\n(x + 1)^2 = 0\n$$\n\n",
            },
          ],
          role: "assistant",
        },
      ],
      parallel_tool_calls: true,
      previous_response_id: null,
      //   prompt_cache_key: null,
      reasoning: {
        effort: "high",
        summary: "detailed",
      },
      //   safety_identifier: null,
      service_tier: "default",
      //   store: false,
      temperature: 1,
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
        input_tokens: 6853,
        input_tokens_details: {
          cached_tokens: 0,
        },
        output_tokens: 414,
        output_tokens_details: {
          reasoning_tokens: 320,
        },
        total_tokens: 7267,
      },
      //   user: null,
      metadata: {},
    },
  },
];
