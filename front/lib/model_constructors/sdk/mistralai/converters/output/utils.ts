import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type {
  ErrorEvent,
  ModelResponseEvent,
  NonDeltaResponseEvent,
  ReasoningEvent,
  TextEvent,
  TokenUsageEvent,
  ToolCallEvent,
} from "@app/lib/model_constructors/types/output/events";
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isRecord, isString } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
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
import { MistralError } from "@mistralai/mistralai/models/errors/mistralerror";

// Parses tool-call arguments into an object, falling back to `{}` for malformed
// or non-object JSON.
function parseToolArguments(argumentsJson: string): Record<string, unknown> {
  const parsed = safeParseJSON(argumentsJson);
  if (parsed.isErr() || parsed.value === null || !isRecord(parsed.value)) {
    return {};
  }
  return parsed.value;
}

function thinkingChunkToText(thinking: ThinkChunk["thinking"]): string {
  return thinking
    .map((chunk) => (chunk.type === "text" ? chunk.text : ""))
    .join("");
}

function usageToTokenUsageEvent(
  metadata: EndpointMetadata,
  usage: UsageInfo | undefined
): TokenUsageEvent {
  return {
    type: "token_usage",
    content: {
      cacheCreated: 0,
      longCacheCreated: 0,
      shortCacheCreated: 0,
      cacheHit: 0,
      standardInput: usage?.promptTokens ?? 0,
      standardOutput: usage?.completionTokens ?? 0,
      reasoning: 0,
    },
    metadata,
  };
}

// Maps any error thrown by the Mistral SDK while streaming into a unified
// `ErrorEvent`, so everything leaving the endpoint is an event, not an exception.
export function streamErrorToErrorEvent(
  metadata: EndpointMetadata,
  error: unknown
): ErrorEvent {
  if (error instanceof MistralError) {
    const status = error.statusCode;
    switch (status) {
      case 400:
        return buildErrorEvent({
          metadata,
          type: "invalid_request_error",
          message: `Invalid request to Mistral: ${error.message}`,
          originalError: error,
        });
      case 401:
        return buildErrorEvent({
          metadata,
          type: "authentication_error",
          message: `Authentication failed for Mistral: ${error.message}`,
          originalError: error,
        });
      case 403:
        return buildErrorEvent({
          metadata,
          type: "permission_error",
          message: `Permission denied for Mistral: ${error.message}`,
          originalError: error,
        });
      case 404:
        return buildErrorEvent({
          metadata,
          type: "not_found_error",
          message: `Resource not found for Mistral: ${error.message}`,
          originalError: error,
        });
      case 429:
        return buildErrorEvent({
          metadata,
          type: "rate_limit_error",
          message: `Rate limit exceeded for Mistral/${metadata.modelId}: ${error.message}`,
          originalError: error,
        });
      default:
        if (status >= 500 && status < 600) {
          return buildErrorEvent({
            metadata,
            type: "server_error",
            message: `Server error from Mistral (${status}): ${error.message}`,
            originalError: error,
          });
        }
        return buildErrorEvent({
          metadata,
          type: "unknown_error",
          message: `Error from Mistral (${status}): ${error.message}`,
          originalError: error,
        });
    }
  }
  return buildErrorEvent({
    metadata,
    type: "unknown_error",
    message: `Unknown error from Mistral: ${normalizeError(error).message}`,
    originalError: error,
  });
}

type Accumulator = {
  textParts: string;
  reasoningParts: string;
  toolCallIndex: number;
};

// Flushes pending reasoning then text as accumulated events, appending them to
// `aggregated`. Reasoning is flushed before text so the final text block stays
// last (checkers assert on the last aggregated event).
function flushAccumulated(
  acc: Accumulator,
  metadata: EndpointMetadata,
  aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[]
): ModelResponseEvent[] {
  const events: ModelResponseEvent[] = [];
  if (acc.reasoningParts) {
    const event: ReasoningEvent = {
      type: "reasoning",
      content: { value: acc.reasoningParts },
      metadata,
    };
    aggregated.push(event);
    events.push(event);
    acc.reasoningParts = "";
  }
  if (acc.textParts) {
    const event: TextEvent = {
      type: "text",
      content: { value: acc.textParts },
      metadata,
    };
    aggregated.push(event);
    events.push(event);
    acc.textParts = "";
  }
  return events;
}

function contentToEvents(
  content: string | ContentChunk[],
  acc: Accumulator,
  metadata: EndpointMetadata
): ModelResponseEvent[] {
  if (isString(content)) {
    if (!content) {
      return [];
    }
    acc.textParts += content;
    return [{ type: "text_delta", content: { value: content }, metadata }];
  }

  const events: ModelResponseEvent[] = [];
  for (const chunk of content) {
    switch (chunk.type) {
      case "text":
        if (chunk.text) {
          acc.textParts += chunk.text;
          events.push({
            type: "text_delta",
            content: { value: chunk.text },
            metadata,
          });
        }
        break;
      case "thinking": {
        const text = thinkingChunkToText(chunk.thinking);
        if (text) {
          acc.reasoningParts += text;
          events.push({
            type: "reasoning_delta",
            content: { value: text },
            metadata,
          });
        }
        break;
      }
      default:
        // Only text and thinking chunks are surfaced.
        break;
    }
  }
  return events;
}

function toolCallToEvents(
  toolCall: ToolCall,
  acc: Accumulator,
  metadata: EndpointMetadata,
  aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[]
): ModelResponseEvent[] {
  if (!toolCall.id) {
    return [];
  }
  const args = isString(toolCall.function.arguments)
    ? parseToolArguments(toolCall.function.arguments)
    : toolCall.function.arguments;

  const events: ModelResponseEvent[] = [
    {
      type: "tool_call_started",
      content: {
        id: toolCall.id,
        index: acc.toolCallIndex,
        name: toolCall.function.name,
      },
      metadata,
    },
  ];
  const toolCallEvent: ToolCallEvent = {
    type: "tool_call",
    content: { id: toolCall.id, name: toolCall.function.name, arguments: args },
    metadata,
  };
  aggregated.push(toolCallEvent);
  events.push(toolCallEvent);
  acc.toolCallIndex += 1;
  return events;
}

// -- Entry point: drive the raw Mistral stream into unified events --

export async function* rawOutputToEvents(
  stream: AsyncGenerator<CompletionEvent>,
  metadata: EndpointMetadata
): AsyncGenerator<ModelResponseEvent> {
  const aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[] = [];
  const acc: Accumulator = {
    textParts: "",
    reasoningParts: "",
    toolCallIndex: 0,
  };
  let hasYieldedResponseId = false;
  let usage: UsageInfo | undefined;

  while (true) {
    let result: IteratorResult<CompletionEvent>;
    try {
      result = await stream.next();
    } catch (err) {
      yield streamErrorToErrorEvent(metadata, err);
      return;
    }
    if (result.done) {
      break;
    }

    const event = result.value;
    if (!hasYieldedResponseId && event.data.id) {
      yield {
        type: "response_id",
        content: { responseId: event.data.id },
        metadata,
      };
      hasYieldedResponseId = true;
    }
    usage = event.data.usage ?? usage;

    const choice = event.data.choices?.[0];
    if (!choice) {
      continue;
    }
    const { delta, finishReason } = choice;

    if (delta.toolCalls) {
      // Flush any text/reasoning produced before the tool call.
      for (const e of flushAccumulated(acc, metadata, aggregated)) {
        yield e;
      }
      for (const toolCall of delta.toolCalls) {
        for (const e of toolCallToEvents(toolCall, acc, metadata, aggregated)) {
          yield e;
        }
      }
    } else if (delta.content) {
      for (const e of contentToEvents(delta.content, acc, metadata)) {
        yield e;
      }
    }

    if (!finishReason) {
      continue;
    }
    switch (finishReason) {
      case CompletionResponseStreamChoiceFinishReason.Length:
        yield buildErrorEvent({
          metadata,
          type: "stop_error",
          message: "The maximum response length was reached.",
        });
        return;
      case CompletionResponseStreamChoiceFinishReason.Error:
        yield buildErrorEvent({
          metadata,
          type: "server_error",
          message: "Mistral reported an error during completion.",
        });
        return;
      // Stop / ToolCalls: flush any pending text/reasoning before success.
      default:
        for (const e of flushAccumulated(acc, metadata, aggregated)) {
          yield e;
        }
        break;
    }
  }

  yield usageToTokenUsageEvent(metadata, usage);
  yield { type: "success", content: { aggregated }, metadata };
}

// -- Non-streaming entry point: a complete batch response → events --

function isNonDeltaEvent(
  event: ModelResponseEvent
): event is NonDeltaResponseEvent {
  return (
    event.type !== "text_delta" &&
    event.type !== "reasoning_delta" &&
    event.type !== "tool_call_delta"
  );
}

function finishReasonToErrorEvent(
  finishReason: ChatCompletionChoiceFinishReason | undefined,
  metadata: EndpointMetadata
): ErrorEvent | null {
  switch (finishReason) {
    case ChatCompletionChoiceFinishReason.Length:
    case ChatCompletionChoiceFinishReason.ModelLength:
      return buildErrorEvent({
        metadata,
        type: "stop_error",
        message: "The maximum response length was reached.",
      });
    case ChatCompletionChoiceFinishReason.Error:
      return buildErrorEvent({
        metadata,
        type: "server_error",
        message: "Mistral reported an error during completion.",
      });
    // Stop / ToolCalls (and any future open-enum value) are not errors.
    default:
      return null;
  }
}

// Turns a complete `ChatCompletionResponse` (as returned by the Batch API) into
// the unified event array, mirroring `rawOutputToEvents` minus the
// streaming-only delta events. Reuses the leaf converters so message semantics
// stay single-sourced.
export function responseToEvents(
  response: ChatCompletionResponse,
  metadata: EndpointMetadata
): NonDeltaResponseEvent[] {
  const events: NonDeltaResponseEvent[] = [];
  const aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[] = [];
  const acc: Accumulator = {
    textParts: "",
    reasoningParts: "",
    toolCallIndex: 0,
  };

  if (response.id) {
    events.push({
      type: "response_id",
      content: { responseId: response.id },
      metadata,
    });
  }

  const choice = response.choices[0];
  const message = choice?.message;

  // Accumulate text/reasoning from the message content, then flush it.
  if (message?.content) {
    for (const event of contentToEvents(message.content, acc, metadata)) {
      if (isNonDeltaEvent(event)) {
        events.push(event);
      }
    }
  }
  for (const event of flushAccumulated(acc, metadata, aggregated)) {
    if (isNonDeltaEvent(event)) {
      events.push(event);
    }
  }

  if (message?.toolCalls) {
    for (const toolCall of message.toolCalls) {
      for (const event of toolCallToEvents(
        toolCall,
        acc,
        metadata,
        aggregated
      )) {
        if (isNonDeltaEvent(event)) {
          events.push(event);
        }
      }
    }
  }

  const errorEvent = finishReasonToErrorEvent(choice?.finishReason, metadata);
  if (errorEvent) {
    events.push(errorEvent);
  }

  events.push(usageToTokenUsageEvent(metadata, response.usage));
  events.push({ type: "success", content: { aggregated }, metadata });

  return events;
}
