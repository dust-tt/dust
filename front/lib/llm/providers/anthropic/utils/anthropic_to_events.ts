import type {
    ContentBlock,
    MessageStreamEvent,
    TextBlock,
    ThinkingBlock,
    ToolUseBlock
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";

import type { LLMEvent, LLMOutputItem, ProviderMetadata, ReasoningDeltaEvent, TextDeltaEvent } from "@app/lib/llm/types";


export function textDelta(delta: string, metadata: ProviderMetadata): TextDeltaEvent {
    return {
        type: "text_delta",
        content: {
            delta,
        },
        metadata,
    };
}

export function reasoningDelta(delta: string, metadata: ProviderMetadata): ReasoningDeltaEvent {
    return {
      type: "reasoning_delta",
      content: {
        delta,
      },
      metadata,
    };
  }

export function finalEvents(itemsAccumulator: LLMOutputItem[], metadata: ProviderMetadata): LLMEvent[] {
    const events: LLMEvent[] = [];
    for (const item of itemsAccumulator) {
      if (item.type === "tool_call") {
        events.push({
          type: "tool_call",
          content: item.content,
          metadata,
        });
      }
    }
    events.push({
      type: "success",
      content: itemsAccumulator,
      metadata,
    });
    return events;
}

function textContentBlockToLLMOutputItem({
    content, 
    metadata, 
    appendToItemsAccumulator
}: {
    content: TextBlock,
    metadata: ProviderMetadata, 
    appendToItemsAccumulator: (item: LLMOutputItem) => void
}): LLMOutputItem {
    const output: LLMOutputItem = {
        type: "text_generated",
        content: {
            text: content.text,
        },
        metadata,
    };
    appendToItemsAccumulator(output);
    return output;
}

function reasoningContentBlockToLLMOutputItem({
    content, 
    metadata, 
    appendToItemsAccumulator
}: {
    content: ThinkingBlock, 
    metadata: ProviderMetadata, 
    appendToItemsAccumulator: (item: LLMOutputItem) => void
}): LLMOutputItem {
    const output: LLMOutputItem = {
        type: "reasoning_generated",
        content: {
            text: content.thinking,
        },
        metadata,
    };
    appendToItemsAccumulator(output);
    return output;
}

function toolUseContentBlockToLLMOutputItem({
    content, 
    metadata, 
    appendToItemsAccumulator
}: {
    content: ToolUseBlock, 
    metadata: ProviderMetadata, 
    appendToItemsAccumulator: (item: LLMOutputItem) => void
}): LLMOutputItem {
    const output: LLMOutputItem = {
        type: "tool_call",
        content: {
            id: content.id,
            name: content.name,
            arguments: JSON.stringify(content.input),
        },
        metadata,
    };
    appendToItemsAccumulator(output);
    return output;
}
function contentBlockToLLMOutputItems({
    content, 
    metadata, 
    appendToItemsAccumulator
}: {
    content: ContentBlock[], 
    metadata: ProviderMetadata, 
    appendToItemsAccumulator: (item: LLMOutputItem) => void
}): LLMOutputItem[] {
    const items: LLMOutputItem[] = [];
    for (const item of content) {
      switch (item.type) {
        case "text":
          items.push(
            textContentBlockToLLMOutputItem({
              content: item,
              metadata,
              appendToItemsAccumulator,
            })
          );
          break;
        case "thinking":
          items.push(
            reasoningContentBlockToLLMOutputItem({
              content: item,
              metadata,
              appendToItemsAccumulator,
            })
          );
          break;
        case "tool_use":
          items.push(
            toolUseContentBlockToLLMOutputItem({
              content: item,
              metadata,
              appendToItemsAccumulator,
            })
          );
          break;
      }
    }
    return items;
}

export function toEvents({
    messageStreamEvent,
    metadata,
    updateMetadata,
    accumulatorUtils,
}: {
    messageStreamEvent: MessageStreamEvent;
    metadata: ProviderMetadata;
    updateMetadata: (key: string, value: any) => void;
    accumulatorUtils: {
        resetItemsAccumulator: () => void;
        appendToItemsAccumulator: (item: LLMOutputItem) => void;
        getItemsAccumulator: () => LLMOutputItem[];
    };
}): LLMEvent[] {
    const events: LLMEvent[] = [];
    switch (messageStreamEvent.type) {
        case "content_block_delta":
            switch (messageStreamEvent.delta.type) {
                case "text_delta":
                    events.push(textDelta(messageStreamEvent.delta.text, metadata));
                    break;
                case "thinking_delta":
                    events.push(reasoningDelta(messageStreamEvent.delta.thinking, metadata));
                    break;
                default:
                    break;
            }
            break;
        case "message_start":
            updateMetadata("messageId", messageStreamEvent.message.id);
            accumulatorUtils.resetItemsAccumulator();
            const items = contentBlockToLLMOutputItems({
                content: messageStreamEvent.message.content, 
                metadata, 
                appendToItemsAccumulator: accumulatorUtils.appendToItemsAccumulator,
            });
            events.push(...items);
            break;
        case "message_stop":
            events.push(...finalEvents(accumulatorUtils.getItemsAccumulator(), metadata));
            break;
        default:
            break;
    }
    return events;
}