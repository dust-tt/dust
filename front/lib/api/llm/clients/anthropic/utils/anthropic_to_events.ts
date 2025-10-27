import type {
  MessageDeltaUsage,
  MessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";

import type {
  LLMEvent,
  ProviderMetadata,
  ReasoningDeltaEvent,
  ReasoningGeneratedEvent,
  TextDeltaEvent,
  TextGeneratedEvent,
  TokenUsageEvent,
  ToolCallEvent,
} from "@app/lib/api/llm/types/events";

export async function* streamLLMEvents(
  messageStreamEvents: AsyncIterable<MessageStreamEvent>,
  metadata: ProviderMetadata
): AsyncGenerator<LLMEvent> {
  let currentBlockIsToolCall: boolean = false;
  let textAccumulator = "";
  let reasoningAccumulator = "";
  let toolAccumulator = {
    id: "",
    name: "",
    input: "",
  };
  let finalEvents: LLMEvent[] = [];
  for await (const messageStreamEvent of messageStreamEvents) {
    if (messageStreamEvent.type === "message_start") {
      metadata["messageId"] = messageStreamEvent.message.id;
    } else {
      switch (messageStreamEvent.type) {
        /* Content is sent as follows:
         * content_block_start (gives the type of the content block and some metadata)
         * content_block_delta (streams content) (multiple times)
         * content_block_stop (makrs the end of the content block)
         */
        case "content_block_start":
          currentBlockIsToolCall =
            messageStreamEvent.content_block.type === "tool_use";
          if (messageStreamEvent.content_block.type === "tool_use") {
            toolAccumulator = {
              id: messageStreamEvent.content_block.id,
              name: messageStreamEvent.content_block.name,
              input: "",
            };
          }
          break;
        case "content_block_delta":
          switch (messageStreamEvent.delta.type) {
            case "text_delta":
              textAccumulator += messageStreamEvent.delta.text;
              yield textDelta(messageStreamEvent.delta.text, metadata);
              break;
            case "thinking_delta":
              reasoningAccumulator += messageStreamEvent.delta.thinking;
              yield reasoningDelta(messageStreamEvent.delta.thinking, metadata);
              break;
            case "input_json_delta":
              toolAccumulator.input += messageStreamEvent.delta.partial_json;
            default:
              continue;
          }
          break;
        case "content_block_stop":
          if (currentBlockIsToolCall) {
            yield toolCall({ ...toolAccumulator, metadata });
          }
          currentBlockIsToolCall = false;
          break;
        case "message_delta":
          yield tokenUsage(messageStreamEvent.usage, metadata);
          if (messageStreamEvent.delta.stop_reason) {
            const stopReason = messageStreamEvent.delta.stop_reason;
            switch (stopReason) {
              case "end_turn":
              case "stop_sequence":
              case "tool_use":
              /* When the assistant pauses the conversation, the stop reason is simply due to a long run, there was no error
               * the model simply decided to take a break here. It should simply be prompted to continue what it was doing.
               */
              case "pause_turn":
                break;
              case "max_tokens":
              case "refusal":
                yield {
                  type: "error",
                  content: {
                    message: `Stop reason: ${stopReason}`,
                    code: 0,
                  },
                  metadata,
                };
                break;
            }
          }
          break;
        case "message_stop":

        default:
          continue;
      }
    }
  }
  if (textAccumulator.length > 0) {
    yield textGenerated(textAccumulator, metadata);
  }
  if (reasoningAccumulator.length > 0) {
    yield reasoningGenerated(reasoningAccumulator, metadata);
  }
}

function textDelta(delta: string, metadata: ProviderMetadata): TextDeltaEvent {
  return {
    type: "text_delta",
    content: {
      delta,
    },
    metadata,
  };
}

function reasoningDelta(
  delta: string,
  metadata: ProviderMetadata
): ReasoningDeltaEvent {
  return {
    type: "reasoning_delta",
    content: {
      delta,
    },
    metadata,
  };
}

function textGenerated(
  text: string,
  metadata: ProviderMetadata
): TextGeneratedEvent {
  return {
    type: "text_generated",
    content: {
      text,
    },
    metadata,
  };
}

function reasoningGenerated(
  text: string,
  metadata: ProviderMetadata
): ReasoningGeneratedEvent {
  return {
    type: "reasoning_generated",
    content: {
      text,
    },
    metadata,
  };
}

function tokenUsage(
  usage: MessageDeltaUsage,
  metadata: ProviderMetadata
): TokenUsageEvent {
  return {
    type: "token_usage",
    content: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens,
      cachedTokens:
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0),
      totalTokens: (usage.input_tokens ?? 0) + usage.output_tokens,
    },
    metadata,
  };
}

function toolCall({
  id,
  name,
  input,
  metadata,
}: {
  id: string;
  name: string;
  input: string;
  metadata: ProviderMetadata;
}): ToolCallEvent {
  return {
    type: "tool_call",
    content: {
      id: id,
      name: name,
      arguments: JSON.stringify(JSON.parse(input)),
    },
    metadata,
  };
}
