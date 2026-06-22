import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type {
  ErrorEvent,
  ModelResponseEvent,
  ReasoningEvent,
  TextEvent,
  TokenUsageEvent,
  ToolCallEvent,
} from "@app/lib/model_constructors/types/output/events";
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isNumber, isRecord, isString } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import { APIError } from "openai";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";

// Parses tool-call arguments into an object, falling back to `{}` for malformed
// or non-object JSON.
function parseToolArguments(argumentsJson: string): Record<string, unknown> {
  const parsed = safeParseJSON(argumentsJson);
  if (parsed.isErr() || parsed.value === null || !isRecord(parsed.value)) {
    return {};
  }
  return parsed.value;
}

// `reasoning_content` is a Fireworks/open-model extension absent from the OpenAI
// chat-completions types, so read it defensively off the delta.
function deltaReasoningContent(delta: object): string | undefined {
  if (isRecord(delta) && isString(delta.reasoning_content)) {
    return delta.reasoning_content;
  }
  return undefined;
}

function usageToTokenUsageEvent(
  metadata: EndpointMetadata,
  usage: ChatCompletionChunk["usage"]
): TokenUsageEvent {
  const cacheHit = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const reasoning = usage?.completion_tokens_details?.reasoning_tokens ?? 0;
  return {
    type: "token_usage",
    content: {
      // OpenAI-style prompt caching has no separate creation cost or TTL buckets.
      cacheCreated: 0,
      longCacheCreated: 0,
      shortCacheCreated: 0,
      cacheHit,
      // prompt_tokens includes cached; subtract to get the uncached portion.
      standardInput: (usage?.prompt_tokens ?? 0) - cacheHit,
      standardOutput: (usage?.completion_tokens ?? 0) - reasoning,
      reasoning,
    },
    metadata,
  };
}

// Maps any error thrown while streaming into a unified `ErrorEvent`, so
// everything leaving the endpoint is an event, not an exception.
export function streamErrorToErrorEvent(
  metadata: EndpointMetadata,
  error: unknown
): ErrorEvent {
  if (error instanceof APIError) {
    const status = error.status;
    switch (status) {
      case 400:
        return buildErrorEvent({
          metadata,
          type: "invalid_request_error",
          message: `Invalid request to Fireworks: ${error.message}`,
          originalError: error,
        });
      case 401:
        return buildErrorEvent({
          metadata,
          type: "authentication_error",
          message: `Authentication failed for Fireworks: ${error.message}`,
          originalError: error,
        });
      case 403:
        return buildErrorEvent({
          metadata,
          type: "permission_error",
          message: `Permission denied for Fireworks: ${error.message}`,
          originalError: error,
        });
      case 404:
        return buildErrorEvent({
          metadata,
          type: "not_found_error",
          message: `Resource not found for Fireworks: ${error.message}`,
          originalError: error,
        });
      case 429:
        return buildErrorEvent({
          metadata,
          type: "rate_limit_error",
          message: `Rate limit exceeded for Fireworks/${metadata.modelId}: ${error.message}`,
          originalError: error,
        });
      default:
        if (isNumber(status) && status >= 500 && status < 600) {
          return buildErrorEvent({
            metadata,
            type: "server_error",
            message: `Server error from Fireworks (${status}): ${error.message}`,
            originalError: error,
          });
        }
        return buildErrorEvent({
          metadata,
          type: "unknown_error",
          message: `Error from Fireworks (${status}): ${error.message}`,
          originalError: error,
        });
    }
  }
  return buildErrorEvent({
    metadata,
    type: "unknown_error",
    message: `Unknown error from Fireworks: ${normalizeError(error).message}`,
    originalError: error,
  });
}

type Accumulator = { textParts: string; reasoningParts: string };

type ToolCallAccumulator = {
  id: string;
  name: string;
  arguments: string;
  startedEmitted: boolean;
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

// -- Entry point: drive the raw chat-completions stream into unified events --

export async function* rawOutputToEvents(
  stream: AsyncGenerator<ChatCompletionChunk>,
  metadata: EndpointMetadata
): AsyncGenerator<ModelResponseEvent> {
  const aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[] = [];
  const acc: Accumulator = { textParts: "", reasoningParts: "" };
  const toolCalls = new Map<number, ToolCallAccumulator>();
  let hasYieldedResponseId = false;
  let usage: ChatCompletionChunk["usage"];

  while (true) {
    let result: IteratorResult<ChatCompletionChunk>;
    try {
      result = await stream.next();
    } catch (err) {
      yield streamErrorToErrorEvent(metadata, err);
      return;
    }
    if (result.done) {
      break;
    }

    const chunk = result.value;
    if (!hasYieldedResponseId && chunk.id) {
      yield {
        type: "response_id",
        content: { responseId: chunk.id },
        metadata,
      };
      hasYieldedResponseId = true;
    }
    usage = chunk.usage ?? usage;

    const choice = chunk.choices[0];
    if (!choice) {
      continue;
    }
    const { delta, finish_reason: finishReason } = choice;

    const reasoningContent = deltaReasoningContent(delta);
    if (reasoningContent) {
      acc.reasoningParts += reasoningContent;
      yield {
        type: "reasoning_delta",
        content: { value: reasoningContent },
        metadata,
      };
    }

    if (delta.content) {
      acc.textParts += delta.content;
      yield { type: "text_delta", content: { value: delta.content }, metadata };
    }

    if (delta.tool_calls) {
      // Flush any text/reasoning produced before the tool call.
      for (const e of flushAccumulated(acc, metadata, aggregated)) {
        yield e;
      }
      for (const toolCallDelta of delta.tool_calls) {
        const { index } = toolCallDelta;
        let entry = toolCalls.get(index);
        if (!entry) {
          entry = { id: "", name: "", arguments: "", startedEmitted: false };
          toolCalls.set(index, entry);
        }
        if (toolCallDelta.id) {
          entry.id = toolCallDelta.id;
        }
        if (toolCallDelta.function?.name) {
          entry.name += toolCallDelta.function.name;
        }
        if (toolCallDelta.function?.arguments) {
          entry.arguments += toolCallDelta.function.arguments;
        }
        if (entry.id && entry.name && !entry.startedEmitted) {
          entry.startedEmitted = true;
          yield {
            type: "tool_call_started",
            content: { id: entry.id, index, name: entry.name },
            metadata,
          };
        }
      }
    }

    if (!finishReason) {
      continue;
    }
    switch (finishReason) {
      case "stop":
        for (const e of flushAccumulated(acc, metadata, aggregated)) {
          yield e;
        }
        break;
      case "tool_calls": {
        for (const e of flushAccumulated(acc, metadata, aggregated)) {
          yield e;
        }
        for (const entry of toolCalls.values()) {
          if (!entry.id || !entry.name) {
            continue;
          }
          const toolCallEvent: ToolCallEvent = {
            type: "tool_call",
            content: {
              id: entry.id,
              name: entry.name,
              arguments: parseToolArguments(entry.arguments),
            },
            metadata,
          };
          aggregated.push(toolCallEvent);
          yield toolCallEvent;
        }
        break;
      }
      case "length":
        yield buildErrorEvent({
          metadata,
          type: "stop_error",
          message: "The maximum response length was reached.",
        });
        return;
      case "content_filter":
        yield buildErrorEvent({
          metadata,
          type: "refusal_error",
          message: "The response was filtered by the content policy.",
        });
        return;
      case "function_call":
        // Legacy function calls are surfaced through tool_calls deltas.
        break;
      default:
        // finish_reason comes off the API stream; ignore unknown values rather
        // than crashing the stream handler if the provider adds a new one.
        assertNeverAndIgnore(finishReason);
    }
  }

  yield usageToTokenUsageEvent(metadata, usage);
  yield { type: "success", content: { aggregated }, metadata };
}
