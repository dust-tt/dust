import type {
  CompletionEvent,
  ContentChunk,
  ToolCall,
  UsageInfo,
} from "@mistralai/mistralai/models/components";
import { CompletionResponseStreamChoiceFinishReason } from "@mistralai/mistralai/models/components";
import compact from "lodash/compact";

import type {
  LLMEvent,
  TokenUsageEvent,
  ToolCallEvent,
} from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import type { ExpectedDeltaMessage } from "@app/lib/api/llm/types/predicates";
import {
  isCorrectCompletionEvent,
  isCorrectDelta,
  isCorrectToolCall,
} from "@app/lib/api/llm/types/predicates";
import logger from "@app/logger/logger";
import { isString } from "@app/types";

export async function* streamLLMEvents({
  completionEvents,
  metadata,
}: {
  completionEvents: AsyncIterable<CompletionEvent>;
  metadata: LLMClientMetadata;
}): AsyncGenerator<LLMEvent> {
  // Mistral does not send a "report" with concatenated text chunks
  // So we have to aggregate it ourselves as we receive text chunks
  let textDelta = "";

  function* yieldEvents(events: LLMEvent[]) {
    for (const event of events) {
      if (event.type === "text_delta") {
        textDelta += event.content.delta;
      }
      yield event;
    }
  }

  for await (const completionEvent of completionEvents) {
    // Ensure we have at least 1 choice
    if (!isCorrectCompletionEvent(completionEvent)) {
      continue;
    }

    const choice = completionEvent.data.choices[0];
    // In practice, Mistral tool calls and text outputs are mutually exclusives
    if (!isCorrectDelta(choice.delta)) {
      continue;
    }

    const events = toLLMEvents({
      delta: choice.delta,
      metadata,
    });

    // Passthrough, keep streaming
    if (choice.finishReason === null) {
      yield* yieldEvents(events);
      continue;
    }

    switch (choice.finishReason) {
      case CompletionResponseStreamChoiceFinishReason.ToolCalls: {
        const textGeneratedEvent = {
          type: "text_generated" as const,
          content: { text: textDelta },
          metadata,
        };
        // Yield aggregated text before tool calls
        yield textGeneratedEvent;
        yield* yieldEvents(events);
        textDelta = "";
        break;
      }
      case CompletionResponseStreamChoiceFinishReason.Length: {
        // yield error event after all received events
        yield* yieldEvents(events);
        textDelta = "";
        yield {
          type: "error" as const,
          content: { message: "Maximum length reached", code: 413 },
          metadata,
        };
        break;
      }
      case CompletionResponseStreamChoiceFinishReason.Error: {
        // yield error event after all received events
        yield* yieldEvents(events);
        textDelta = "";
        yield {
          type: "error" as const,
          content: {
            message: "An error occurred during completion",
            code: 500,
          },
          metadata,
        };
        break;
      }
      // Streaming ends with a text response
      case CompletionResponseStreamChoiceFinishReason.Stop: {
        yield* yieldEvents(events);
        const textGeneratedEvent = {
          type: "text_generated" as const,
          content: { text: textDelta },
          metadata,
        };
        textDelta = "";
        yield textGeneratedEvent;
        break;
      }
      default: {
        logger.error(`Unknown finish reason: ${choice.finishReason}`);
        break;
      }
    }
    // Whatever the completion, yield the token usage
    if (completionEvent.data.usage) {
      yield toTokenUsage({ usage: completionEvent.data.usage, metadata });
    }
  }
}

export function toLLMEvents({
  delta,
  metadata,
}: {
  delta: ExpectedDeltaMessage;
  metadata: LLMClientMetadata;
}): LLMEvent[] {
  const { content, toolCalls } = delta;

  if (toolCalls) {
    return compact(
      toolCalls.map((toolCall) =>
        toToolEvent({
          toolCall,
          metadata,
        })
      )
    );
  }

  return toStreamEvents({ content, metadata });
}

function toTokenUsage({
  usage,
  metadata,
}: {
  usage: UsageInfo;
  metadata: LLMClientMetadata;
}): TokenUsageEvent {
  return {
    type: "token_usage",
    content: {
      inputTokens: usage.promptTokens ?? 0,
      outputTokens: usage.completionTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    },
    metadata,
  };
}

function toToolEvent({
  toolCall,
  metadata,
}: {
  toolCall: ToolCall;
  metadata: LLMClientMetadata;
}): ToolCallEvent | null {
  if (!isCorrectToolCall(toolCall)) {
    return null;
  }

  return {
    type: "tool_call",
    content: {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: isString(toolCall.function.arguments)
        ? toolCall.function.arguments
        : JSON.stringify(toolCall.function.arguments),
    },
    metadata,
  };
}

function toStreamEvents({
  content,
  metadata,
}: {
  content: string | Array<ContentChunk>;
  metadata: LLMClientMetadata;
}): LLMEvent[] {
  if (isString(content)) {
    return [
      {
        type: "text_delta",
        content: { delta: content },
        metadata,
      },
    ];
  }

  return compact(
    content.map((chunk) =>
      contentChunkToLLMEvent({
        chunk,
        metadata,
      })
    )
  );
}

function contentChunkToLLMEvent({
  chunk,
  metadata,
}: {
  chunk: ContentChunk;
  metadata: LLMClientMetadata;
}): LLMEvent | null {
  switch (chunk.type) {
    case "text": {
      return {
        type: "text_delta",
        content: { delta: chunk.text },
        metadata,
      };
    }
    default:
      // Only support text for now
      return null;
  }
}
