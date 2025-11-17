import type { ResponseStreamEvent } from "openai/resources/responses/responses";

export const reasoningModelOutput: ResponseStreamEvent[] = [
  {
    type: "response.output_item.added",
    output_index: 0,
    sequence_number: 1,
    item: {
      id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
      type: "reasoning",
      summary: [],
    },
  },
  {
    type: "response.reasoning_summary_part.added",
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    sequence_number: 2,
    summary_index: 0,
    part: {
      type: "summary_text",
      text: "",
    },
  },
  {
    type: "response.reasoning_summary_text.delta",
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    sequence_number: 3,
    summary_index: 0,
    // Chunks are much smaller
    delta: "**Solving the Equation**\n\nWe need to ",
  },
  {
    type: "response.reasoning_summary_text.delta",
    sequence_number: 4,
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    summary_index: 0,
    delta: "solve the equation.\n\n",
  },
  {
    type: "response.reasoning_summary_text.done",
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    summary_index: 0,
    sequence_number: 5,
    text: "**Solving the Equation**\n\nWe need to solve the equation.\n\n",
  },
  {
    type: "response.reasoning_summary_part.done",
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    sequence_number: 6,
    summary_index: 0,
    part: {
      type: "summary_text",
      text: "**Solving the Equation**\n\nWe need to solve the equation.\n\n",
    },
  },
  {
    type: "response.reasoning_summary_part.added",
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    sequence_number: 7,
    summary_index: 1,
    part: {
      type: "summary_text",
      text: "",
    },
  },
  {
    type: "response.reasoning_summary_text.delta",
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    sequence_number: 8,
    summary_index: 1,
    delta: "**Solving the Quadratic**\n\nTo solve ",
  },
  {
    type: "response.reasoning_summary_text.delta",
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    sequence_number: 9,
    summary_index: 1,
    delta: "the equation $$x^2 + 2x + 1 = 0$$, I can factor it...",
  },
  {
    type: "response.reasoning_summary_text.done",
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    sequence_number: 10,
    summary_index: 1,
    text: "**Solving the Quadratic**\n\nTo solve the equation $$x^2 + 2x + 1 = 0$$, I can factor it...",
  },
  {
    type: "response.reasoning_summary_part.done",
    item_id: "rs_06e2b572b276da09016901d7350ae08198ba76145524efe4b2",
    output_index: 0,
    sequence_number: 11,
    summary_index: 1,
    part: {
      type: "summary_text",
      text: "**Solving the Quadratic**\n\nTo solve the equation $$x^2 + 2x + 1 = 0$$, I can factor it...",
    },
  },
  {
    type: "response.output_item.done",
    output_index: 0,
    sequence_number: 12,
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
    output_index: 1,
    sequence_number: 13,
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
    item_id: "msg_06e2b572b276da09016901d73fd5b481988a2e67a253b03e55",
    output_index: 1,
    sequence_number: 14,
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
    item_id: "msg_06e2b572b276da09016901d73fd5b481988a2e67a253b03e55",
    output_index: 1,
    sequence_number: 15,
    content_index: 0,
    delta: "# Solving the equation\n\nGiven:\n$$\nx^2 + 2x + 1 = 0\n",
    logprobs: [],
  },
  {
    type: "response.output_text.delta",
    item_id: "msg_06e2b572b276da09016901d73fd5b481988a2e67a253b03e55",
    output_index: 1,
    sequence_number: 16,
    content_index: 0,
    delta: "$$\n\nNotice it factors as:\n$$\n(x + 1)^2 = 0\n$$\n\n",
    logprobs: [],
  },
  {
    type: "response.output_text.done",
    item_id: "msg_06e2b572b276da09016901d73fd5b481988a2e67a253b03e55",
    output_index: 1,
    sequence_number: 17,
    content_index: 0,
    text: "# Solving the equation\n\nGiven:\n$$\nx^2 + 2x + 1 = 0\n$$\n\nNotice it factors as:\n$$\n(x + 1)^2 = 0\n$$\n\n",
    logprobs: [],
  },
  {
    type: "response.content_part.done",
    item_id: "msg_06e2b572b276da09016901d73fd5b481988a2e67a253b03e55",
    output_index: 1,
    sequence_number: 18,
    content_index: 0,
    part: {
      type: "output_text",
      annotations: [],
      text: "# Solving the equation\n\nGiven:\n$$\nx^2 + 2x + 1 = 0\n$$\n\nNotice it factors as:\n$$\n(x + 1)^2 = 0\n$$\n\n",
    },
  },
  {
    type: "response.output_item.done",
    output_index: 1,
    sequence_number: 19,
    item: {
      id: "msg_06e2b572b276da09016901d73fd5b481988a2e67a253b03e55",
      type: "message",
      status: "completed",
      content: [
        {
          type: "output_text",
          annotations: [],
          text: "# Solving the equation\n\nGiven:\n$$\nx^2 + 2x + 1 = 0\n$$\n\nNotice it factors as:\n$$\n(x + 1)^2 = 0\n$$\n\n",
        },
      ],
      role: "assistant",
    },
  },
  {
    type: "response.completed",
    // @ts-expect-error broke open ai types
    response: {
      id: "resp_06e2b572b276da09016901d7340ee881989921d590530b244e",
      object: "response",
      created_at: 1761728308,
      status: "completed",
      error: null,
      incomplete_details: null,
      instructions: null,
      max_output_tokens: null,
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
              text: "# Solving the equation\n\nGiven:\n$$\nx^2 + 2x + 1 = 0\n$$\n\nNotice it factors as:\n$$\n(x + 1)^2 = 0\n$$\n\n",
            },
          ],
          role: "assistant",
        },
      ],
      parallel_tool_calls: true,
      previous_response_id: null,
      reasoning: {
        effort: "high",
        summary: "detailed",
      },
      service_tier: "default",
      temperature: 1,
      text: {
        format: {
          type: "text",
        },
      },
      tool_choice: "auto",
      tools: [
        // Some tools
      ],
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
      metadata: {},
    },
  },
];
