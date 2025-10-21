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
  ToolCallEvent,
} from "@app/lib/api/llm/types/events";
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
  metadata: ProviderMetadata;
}): AsyncGenerator<LLMEvent> {
  // Mistral does not send a "report" with concatenated text chunks
  // So we have to aggregate it ourselves as we receive text chunks
  let textDelta = "";

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

    if (
      choice.finishReason ===
      CompletionResponseStreamChoiceFinishReason.ToolCalls
    ) {
      const textGeneratedEvent = {
        type: "text_generated" as const,
        content: { text: textDelta },
        metadata,
      };
      textDelta = "";
      // Yield text generated event before tool call event
      yield textGeneratedEvent;
    }

    for (const event of events) {
      event.type === "text_delta" && (textDelta += event.content.delta);
      yield event;
    }

    if (
      !choice.finishReason ||
      choice.finishReason ===
        CompletionResponseStreamChoiceFinishReason.ToolCalls
    ) {
      continue;
    }

    switch (choice.finishReason) {
      case CompletionResponseStreamChoiceFinishReason.Length: {
        textDelta = "";
        yield {
          type: "error" as const,
          content: { message: "Maximum length reached", code: 413 },
          metadata,
        };
        break;
      }
      case CompletionResponseStreamChoiceFinishReason.Error: {
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
      case CompletionResponseStreamChoiceFinishReason.Stop: {
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
        logger.error(`Unknown finish reason: ${choice.finishReason as string}`);
        continue;
      }
    }
  }
}

export function toLLMEvents({
  delta,
  metadata,
}: {
  delta: ExpectedDeltaMessage;
  metadata: ProviderMetadata;
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

function toToolEvent({
  toolCall,
  metadata,
}: {
  toolCall: ToolCall;
  metadata: ProviderMetadata;
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
  metadata: ProviderMetadata;
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
  metadata: ProviderMetadata;
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
