import type {
  MessageDeltaUsage,
  MessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";

import type {
  LLMEvent,
  ReasoningDeltaEvent,
  ReasoningGeneratedEvent,
  TextDeltaEvent,
  TextGeneratedEvent,
  TokenUsageEvent,
  ToolCallEvent,
} from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { safeParseJSON } from "@app/types";

export async function* streamLLMEvents(
  messageStreamEvents: AsyncIterable<MessageStreamEvent>,
  metadata: LLMClientMetadata
): AsyncGenerator<LLMEvent> {
  let currentBlockIsToolCall: boolean = false;
  let textAccumulator = "";
  let reasoningAccumulator = "";
  let toolAccumulator = {
    id: "",
    name: "",
    input: "",
  };
  for await (const messageStreamEvent of messageStreamEvents) {
    if (messageStreamEvent.type === "message_start") {
      // TODO: find what to do with message messageId
      const messageId = messageStreamEvent.message.id;
    } else {
      switch (messageStreamEvent.type) {
        /* Content is sent as follows:
         * content_block_start (gives the type of the content block and some metadata)
         * content_block_delta (streams content) (multiple times)
         * content_block_stop (makrs the end of the content block)
         */
        case "content_block_start":
          if (messageStreamEvent.content_block.type === "tool_use") {
            currentBlockIsToolCall = true;
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
              break;
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
                break;
              case "stop_sequence":
                break;
              case "tool_use":
                break;
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

function textDelta(delta: string, metadata: LLMClientMetadata): TextDeltaEvent {
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
  metadata: LLMClientMetadata
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
  metadata: LLMClientMetadata
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
  metadata: LLMClientMetadata
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
  metadata: LLMClientMetadata
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
  metadata: LLMClientMetadata;
}): ToolCallEvent {
  const args = safeParseJSON(input);
  if (args.isErr()) {
    throw new Error(`Failed to parse tool call arguments: ${args.error}`);
  }
  return {
    type: "tool_call",
    content: {
      id: id,
      name: name,
      arguments: JSON.stringify(args.value),
    },
    metadata,
  };
}
