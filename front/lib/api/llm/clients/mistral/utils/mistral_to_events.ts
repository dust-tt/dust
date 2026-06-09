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
import { isString } from "@app/types/shared/utils/general";
import type {
  ChatCompletionResponse,
  CompletionEvent,
  ContentChunk,
  ThinkChunk,
  ToolCall,
  UsageInfo,
} from "@mistralai/mistralai/models/components";
import {
  ChatCompletionChoiceFinishReason,
  CompletionResponseStreamChoiceFinishReason,
} from "@mistralai/mistralai/models/components";
import compact from "lodash/compact";

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
  let reasoningDelta = "";
  let hasYieldedResponseId = false;

  const aggregate = new SuccessAggregate();

  function* yieldEvents(events: LLMEvent[]) {
    for (const event of events) {
      if (event.type === "text_delta") {
        textDelta += event.content.delta;
      } else if (event.type === "reasoning_delta") {
        reasoningDelta += event.content.delta;
      }
      aggregate.add(event);
      yield event;
    }
  }

  function* flushReasoning() {
    if (reasoningDelta.length > 0) {
      yield* yieldEvents([
        {
          type: "reasoning_generated" as const,
          content: { text: reasoningDelta },
          metadata,
        },
      ]);
      reasoningDelta = "";
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
        yield* flushReasoning();
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
        reasoningDelta = "";
        yield* yieldEvents([
          new EventError(
            {
              type: "maximum_length",
              isRetryable: true,
              message: "Maximum length reached",
              originalError: { choice },
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
        reasoningDelta = "";
        yield* yieldEvents([
          new EventError(
            {
              type: "stop_error",
              isRetryable: true,
              message: "An error occurred during completion",
              originalError: { choice },
            },
            metadata
          ),
        ]);

        break;
      }
      // Streaming ends with a text response
      case CompletionResponseStreamChoiceFinishReason.Stop: {
        yield* yieldEvents(events);
        yield* flushReasoning();
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
    case "thinking": {
      const text = thinkingChunkToText(chunk.thinking);
      return text.length > 0
        ? {
            type: "reasoning_delta",
            content: { delta: text },
            metadata,
          }
        : null;
    }
    default:
      // Only text and thinking chunks are surfaced as events.
      return null;
  }
}

function thinkingChunkToText(thinking: ThinkChunk["thinking"]): string {
  return thinking
    .map((chunk) => (chunk.type === "text" ? chunk.text : ""))
    .join("");
}

/**
 * Converts a non-streaming ChatCompletionResponse (batch result) to LLM events.
 */
export function chatCompletionToLLMEvents(
  response: ChatCompletionResponse,
  metadata: LLMClientMetadata
): LLMEvent[] {
  const events: LLMEvent[] = [];
  const aggregate = new SuccessAggregate();

  function addEvent(event: LLMEvent): void {
    aggregate.add(event);
    events.push(event);
  }

  addEvent({
    type: "interaction_id",
    content: { modelInteractionId: response.id },
    metadata,
  });

  if (!response.choices || response.choices.length === 0) {
    addEvent(
      new EventError(
        {
          type: "stream_error",
          message: "Mistral batch response has no choices",
          isRetryable: false,
        },
        metadata
      )
    );
    return events;
  }

  const choice = response.choices[0];
  switch (choice.finishReason) {
    case ChatCompletionChoiceFinishReason.Stop:
    case ChatCompletionChoiceFinishReason.ToolCalls: {
      const message = choice.message;
      if (!message) {
        break;
      }
      const { content, toolCalls } = message;
      if (content) {
        const { text, reasoning } = batchContentToParts(content);
        if (reasoning.length > 0) {
          addEvent({
            type: "reasoning_generated",
            content: { text: reasoning },
            metadata,
          });
        }
        if (text.length > 0) {
          addEvent({
            type: "text_generated",
            content: { text },
            metadata,
          });
        }
      }
      if (toolCalls) {
        for (const toolCall of toolCalls) {
          const toolEvent = toToolEvent({ toolCall, metadata });
          if (toolEvent) {
            addEvent(toolEvent);
          }
        }
      }
      break;
    }
    case ChatCompletionChoiceFinishReason.Length:
    case ChatCompletionChoiceFinishReason.ModelLength: {
      addEvent(
        new EventError(
          {
            type: "maximum_length",
            isRetryable: true,
            message: "Maximum length reached",
            originalError: { choice },
          },
          metadata
        )
      );
      break;
    }
    case ChatCompletionChoiceFinishReason.Error: {
      addEvent(
        new EventError(
          {
            type: "stop_error",
            isRetryable: true,
            message: "An error occurred during completion",
            originalError: { choice },
          },
          metadata
        )
      );
      break;
    }
    default: {
      logger.error(
        `Unknown Mistral batch finish reason: ${choice.finishReason}`
      );
      break;
    }
  }

  addEvent(toTokenUsage({ usage: response.usage, metadata }));

  addEvent({
    type: "success",
    aggregated: aggregate.aggregated,
    textGenerated: aggregate.textGenerated,
    reasoningGenerated: aggregate.reasoningGenerated,
    toolCalls: aggregate.toolCalls,
    metadata,
  });

  return events;
}

function batchContentToParts(content: string | Array<ContentChunk>): {
  text: string;
  reasoning: string;
} {
  if (isString(content)) {
    return { text: content, reasoning: "" };
  }
  let text = "";
  let reasoning = "";
  for (const chunk of content) {
    if (chunk.type === "text") {
      text += chunk.text;
    } else if (chunk.type === "thinking") {
      reasoning += thinkingChunkToText(chunk.thinking);
    }
  }
  return { text, reasoning };
}
