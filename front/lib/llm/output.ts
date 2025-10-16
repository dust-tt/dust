export const dataTypes = {
  anthropic: {
    textChunk: {
      type: "content_block_delta",
      index: 0,
      delta: {
        type: "text_delta",
        text: "<thinking",
      },
    },
  },
  openai: {
    textChunk: [
      {
        type: "response.output_item.added",
        sequence_number: 2,
        output_index: 0,
        item: {
          id: "msg_0afdfe3bc0cb6bcd0168ee71ef83b8819780fa58400a696af5",
          type: "message",
          status: "in_progress",
          content: [],
          role: "assistant",
        },
      },
      {
        type: "response.content_part.added",
        sequence_number: 3,
        item_id: "msg_0afdfe3bc0cb6bcd0168ee71ef83b8819780fa58400a696af5",
        output_index: 0,
        content_index: 0,
        part: {
          type: "output_text",
          annotations: [],
          logprobs: [],
          text: "",
        },
      },
      {
        type: "response.output_text.delta",
        sequence_number: 4,
        item_id: "msg_0afdfe3bc0cb6bcd0168ee71ef83b8819780fa58400a696af5",
        output_index: 0,
        content_index: 0,
        delta: "Hello",
        logprobs: [],
        obfuscation: "09DO0RKutNi",
      },
    ],
  },
  mistral: {
    textChunk: {
      data: {
        id: "05b30b841a7c4878b0d190a0fa37398f",
        object: "chat.completion.chunk",
        created: 1760457197,
        model: "mistral-large-latest",
        choices: [
          {
            index: 0,
            delta: {
              content: "Hello",
            },
            finishReason: null,
          },
        ],
      },
    },
  },
  google: {},
};
