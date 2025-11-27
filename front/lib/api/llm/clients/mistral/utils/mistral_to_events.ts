import type {
  CompletionEvent,
  ContentChunk,
  ToolCall,
  UsageInfo,
} from "@mistralai/mistralai/models/components";
import { CompletionResponseStreamChoiceFinishReason } from "@mistralai/mistralai/models/components";
import compact from "lodash/compact";

import { SuccessAggregate } from "@app/lib/api/llm/types/aggregates";
import type {
  LLMEvent,
  TokenUsageEvent,
  ToolCallEvent,
} from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import type { ExpectedDeltaMessage } from "@app/lib/api/llm/types/predicates";
import {
  isCorrectCompletionEvent,
  isCorrectDelta,
  isCorrectToolCall,
} from "@app/lib/api/llm/types/predicates";
import { parseToolArguments } from "@app/lib/api/llm/utils/tool_arguments";
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
  let hasYieldedResponseId = false;

  const aggregate = new SuccessAggregate();

  function* yieldEvents(events: LLMEvent[]) {
    for (const event of events) {
      if (event.type === "text_delta") {
        textDelta += event.content.delta;
      }
      aggregate.add(event);
      yield event;
    }
  }

  for await (const completionEvent of completionEvents) {
    const modelInteractionId = completionEvent.data.id;
    if (!hasYieldedResponseId) {
      yield {
        type: "interaction_id",
        content: {
          modelInteractionId,
        },
        metadata,
      };
      hasYieldedResponseId = true;
    }

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
        yield* yieldEvents(
          textGeneratedEvent.content.text.length > 0 ? [textGeneratedEvent] : []
        );
        textDelta = "";
        yield* yieldEvents(events);
        break;
      }
      case CompletionResponseStreamChoiceFinishReason.Length: {
        // yield error event after all received events
        yield* yieldEvents(events);
        textDelta = "";
        yield* yieldEvents([
          new EventError(
            {
              type: "maximum_length",
              isRetryable: false,
              message: "Maximum length reached",
            },
            metadata
          ),
        ]);
        break;
      }
      case CompletionResponseStreamChoiceFinishReason.Error: {
        // yield error event after all received events
        yield* yieldEvents(events);
        textDelta = "";
        yield* yieldEvents([
          new EventError(
            {
              type: "stop_error",
              isRetryable: false,
              message: "An error occurred during completion",
            },
            metadata
          ),
        ]);

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
        yield* yieldEvents(
          textGeneratedEvent.content.text.length > 0 ? [textGeneratedEvent] : []
        );
        break;
      }
      default: {
        logger.error(`Unknown finish reason: ${choice.finishReason}`);
        break;
      }
    }
    // Whatever the completion, yield the token usage
    if (completionEvent.data.usage) {
      yield* yieldEvents([
        toTokenUsage({ usage: completionEvent.data.usage, metadata }),
      ]);
    }

    yield {
      type: "success",
      aggregated: aggregate.aggregated,
      textGenerated: aggregate.textGenerated,
      reasoningGenerated: aggregate.reasoningGenerated,
      toolCalls: aggregate.toolCalls,
      metadata,
    };
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

  let args: Record<string, unknown>;
  if (isString(toolCall.function.arguments)) {
    args = parseToolArguments(
      toolCall.function.arguments,
      toolCall.function.name
    );
  } else {
    args = toolCall.function.arguments;
  }

  return {
    type: "tool_call",
    content: {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: args,
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
    return content.length > 0
      ? [
          {
            type: "text_delta",
            content: { delta: content },
            metadata,
          },
        ]
      : [];
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
      return chunk.text.length > 0
        ? {
            type: "text_delta",
            content: { delta: chunk.text },
            metadata,
          }
        : null;
    }
    default:
      // Only support text for now
      return null;
  }
}
