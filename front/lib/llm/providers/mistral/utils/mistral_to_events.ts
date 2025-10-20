import type {
  CompletionEvent,
  ContentChunk,
  ToolCall,
} from "@mistralai/mistralai/models/components";
import { CompletionResponseStreamChoiceFinishReason } from "@mistralai/mistralai/models/components";
import compact from "lodash/compact";

import type {
  LLMEvent,
  ProviderMetadata,
  TextGeneratedEvent,
  TokenUsageEvent,
  ToolCallEvent,
} from "@app/lib/llm/types/events";

function contentChunkToLLMEvent({
  chunk,
  metadata,
  appendToTextAccumulator,
}: {
  chunk: ContentChunk;
  metadata: ProviderMetadata;
  appendToTextAccumulator: (text: string) => void;
}): LLMEvent | null {
  switch (chunk.type) {
    case "text": {
      appendToTextAccumulator(chunk.text);
      return {
        type: "text_delta",
        content: { delta: chunk.text },
        metadata,
      };
    }
    default:
      return null;
  }
}

function toToolEvent({
  toolCall,
  metadata,
}: {
  toolCall: ToolCall;
  metadata: ProviderMetadata;
}): ToolCallEvent {
  return {
    type: "tool_call",
    content: {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments:
        typeof toolCall.function.arguments === "string"
          ? toolCall.function.arguments
          : // : "",
            JSON.stringify(toolCall.function.arguments),
    },
    metadata,
  };
}

export function toEvents({
  completionEvent,
  metadata,
  accumulatorUtils,
}: {
  completionEvent: CompletionEvent;
  metadata: ProviderMetadata;
  accumulatorUtils: {
    resetTextAccumulator: () => void;
    appendToTextAccumulator: (text: string) => void;
    getTextAccumulator: () => string;
  };
}): LLMEvent[] {
  const choice = completionEvent.data.choices[0];

  const content = choice.delta.content;
  const toolCalls = choice.delta.toolCalls;

  const events: LLMEvent[] = [];

  switch (true) {
    case typeof content === "string": {
      accumulatorUtils.appendToTextAccumulator(content);
      events.push({
        type: "text_delta",
        content: { delta: content },
        metadata,
      });
      break;
    }
    case Array.isArray(content): {
      events.push(
        ...compact(
          content.map((chunk) =>
            contentChunkToLLMEvent({
              chunk,
              metadata,
              appendToTextAccumulator: accumulatorUtils.appendToTextAccumulator,
            })
          )
        )
      );
      break;
    }
    case Array.isArray(toolCalls): {
      events.push(
        ...toolCalls.map((toolCall) => toToolEvent({ toolCall, metadata }))
      );
      break;
    }
  }

  if (choice.finishReason === null) {
    return events;
  }

  let tokenUsageEvent: TokenUsageEvent | null = null;
  let textGeneratedEvent: TextGeneratedEvent | null = null;

  if (completionEvent.data.usage?.totalTokens !== undefined) {
    tokenUsageEvent = {
      type: "token_usage",
      content: {
        inputTokens: completionEvent.data.usage.promptTokens ?? 0,
        outputTokens: completionEvent.data.usage.completionTokens ?? 0,
        totalTokens: completionEvent.data.usage.totalTokens,
      },
      metadata,
    };
  }

  const textAccumulator = accumulatorUtils.getTextAccumulator();

  if (textAccumulator.length > 0) {
    textGeneratedEvent = {
      type: "text_generated" as const,
      content: { text: textAccumulator },
      metadata,
    };
    accumulatorUtils.resetTextAccumulator();
  }

  switch (choice.finishReason) {
    case CompletionResponseStreamChoiceFinishReason.Length: {
      const completionEvents = compact([
        tokenUsageEvent,
        {
          type: "error" as const,
          content: { message: "Maximum length reached", code: 413 },
          metadata,
        },
      ]);
      events.push(...completionEvents);
      return events;
    }
    case CompletionResponseStreamChoiceFinishReason.ToolCalls: {
      return compact([textGeneratedEvent, ...events, tokenUsageEvent]);
    }
    default: {
      const completionEvents = compact([textGeneratedEvent, tokenUsageEvent]);
      accumulatorUtils.resetTextAccumulator();
      events.push(...completionEvents);
      return events;
    }
  }
}
