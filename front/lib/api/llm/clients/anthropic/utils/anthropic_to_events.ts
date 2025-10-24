import type {
  ContentBlock,
  MessageDeltaUsage,
  MessageStreamEvent,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
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

export async function* streamLLMEvents({
  messageStreamEvents,
  metadata,
}: {
  messageStreamEvents: AsyncIterable<MessageStreamEvent>;
  metadata: ProviderMetadata;
}): AsyncGenerator<LLMEvent> {
  let finalEvents: LLMEvent[] = [];
  for await (const messageStreamEvent of messageStreamEvents) {
    if (messageStreamEvent.type === "message_start") {
      // Anthropic sends the whole messages and tool calls in the first message,
      // we want to send them at the end of the stream like other providers
      metadata["messageId"] = messageStreamEvent.message.id;
      finalEvents = contentBlockToEvents({
        content: messageStreamEvent.message.content,
        metadata,
      });
    } else {
      yield* toEvents({
        messageStreamEvent,
        metadata,
        finalEvents,
      });
    }
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

function textContentBlockToTextGeneratedEvent({
  content,
  metadata,
}: {
  content: TextBlock;
  metadata: ProviderMetadata;
}): TextGeneratedEvent {
  return {
    type: "text_generated",
    content: {
      text: content.text,
    },
    metadata,
  };
}

function reasoningContentBlockToReasoningGeneratedEvent({
  content,
  metadata,
}: {
  content: ThinkingBlock;
  metadata: ProviderMetadata;
}): ReasoningGeneratedEvent {
  return {
    type: "reasoning_generated",
    content: {
      text: content.thinking,
    },
    metadata,
  };
}

function toolUseContentBlockToToolCallEvent({
  content,
  metadata,
}: {
  content: ToolUseBlock;
  metadata: ProviderMetadata;
}): ToolCallEvent {
  return {
    type: "tool_call",
    content: {
      id: content.id,
      name: content.name,
      arguments: JSON.stringify(content.input),
    },
    metadata,
  };
}

function contentBlockToEvents({
  content,
  metadata,
}: {
  content: ContentBlock[];
  metadata: ProviderMetadata;
}): LLMEvent[] {
  const items: LLMEvent[] = [];
  for (const item of content) {
    switch (item.type) {
      case "text":
        items.push(
          textContentBlockToTextGeneratedEvent({
            content: item,
            metadata,
          })
        );
        break;
      case "thinking":
        items.push(
          reasoningContentBlockToReasoningGeneratedEvent({
            content: item,
            metadata,
          })
        );
        break;
      case "tool_use":
        items.push(
          toolUseContentBlockToToolCallEvent({
            content: item,
            metadata,
          })
        );
        break;
    }
  }
  return items;
}

function toEvents({
  messageStreamEvent,
  metadata,
  finalEvents,
}: {
  messageStreamEvent: MessageStreamEvent;
  metadata: ProviderMetadata;
  finalEvents: LLMEvent[];
}): LLMEvent[] {
  const events: LLMEvent[] = [];
  switch (messageStreamEvent.type) {
    case "content_block_delta":
      switch (messageStreamEvent.delta.type) {
        case "text_delta":
          events.push(textDelta(messageStreamEvent.delta.text, metadata));
          break;
        case "thinking_delta":
          events.push(
            reasoningDelta(messageStreamEvent.delta.thinking, metadata)
          );
          break;
        default:
          break;
      }
      break;
    case "message_delta":
      events.push(tokenUsage(messageStreamEvent.usage, metadata));
      if (messageStreamEvent.delta.stop_reason) {
        const stopReason = messageStreamEvent.delta.stop_reason;
        switch (stopReason) {
          case "end_turn":
          case "stop_sequence":
          case "tool_use":
          // pause simply stops a long run but it can be resumed
          case "pause_turn":
            break;
          case "max_tokens":
          case "refusal":
            events.push({
              type: "error",
              content: {
                message: `Stop reason: ${stopReason}`,
                code: 0,
              },
              metadata,
            });
            break;
        }
      }
      break;
    case "message_stop":
      events.push(...finalEvents);
      break;
    default:
      break;
  }
  return events;
}
