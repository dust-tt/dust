import flatMap from "lodash/flatMap";
import type {
  ResponseOutputItem,
  ResponseOutputRefusal,
  ResponseOutputText,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { Response } from "openai/resources/responses/responses";

import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { assertNever } from "@app/types";

export async function* streamLLMEvents(
  responseStreamEvents: AsyncIterable<ResponseStreamEvent>,
  metadata: LLMClientMetadata
): AsyncGenerator<LLMEvent> {
  for await (const event of responseStreamEvents) {
    const outputEvents = toEvents({
      event,
      metadata,
    });
    for (const outputEvent of outputEvents) {
      yield outputEvent;
    }
  }
}

function textDelta(delta: string, metadata: LLMClientMetadata): LLMEvent {
  return {
    type: "text_delta",
    content: {
      delta,
    },
    metadata,
  };
}

function reasoningDelta(delta: string, metadata: LLMClientMetadata): LLMEvent {
  return {
    type: "reasoning_delta",
    content: {
      delta,
    },
    metadata,
  };
}

function responseOutputToEvent(
  responseOutput: ResponseOutputText | ResponseOutputRefusal,
  metadata: LLMClientMetadata
): LLMEvent {
  switch (responseOutput.type) {
    case "output_text":
      return {
        type: "text_generated",
        content: {
          text: responseOutput.text,
        },
        metadata,
      };
    case "refusal":
      return new EventError(
        {
          type: "refusal_error",
          isRetryable: false,
          message: responseOutput.refusal,
          statusCode: 500,
        },
        metadata
      );

    default:
      assertNever(responseOutput);
  }
}

function itemToEvents(
  item: ResponseOutputItem,
  metadata: LLMClientMetadata
): LLMEvent[] {
  switch (item.type) {
    case "message":
      return item.content.map((responseOutput) =>
        responseOutputToEvent(responseOutput, metadata)
      );
    // TODO(LLM-Router 2025-10-29): Check tool call validity when parsing events
    case "function_call":
      return [
        {
          type: "tool_call",
          content: {
            id: item.call_id,
            name: item.name,
            arguments: item.arguments,
          },
          metadata,
        },
      ];
    case "reasoning":
      return item.summary.map((summary) => ({
        type: "reasoning_generated",
        content: {
          text: summary.text,
        },
        metadata,
      }));
    default:
      // TODO(LLM-Router 2025-10-28): Send error event
      throw new Error(`Unsupported OpenAI Response Item: ${item}`);
  }
}

function responseCompleted(
  response: Response,
  metadata: LLMClientMetadata
): LLMEvent[] {
  const events: LLMEvent[] = flatMap(
    response.output.map((i) => itemToEvents(i, metadata))
  );

  if (!response.usage) {
    return events;
  }

  const {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
  } = response.usage;
  // even if in the types `input_tokens_details` and `output_tokens_details` are NOT optional,
  // some providers (e.g. Fireworks) return them as null
  const cachedTokens = response.usage.input_tokens_details?.cached_tokens;
  const reasoningTokens =
    response.usage.output_tokens_details?.reasoning_tokens;

  events.push({
    type: "token_usage",
    content: {
      inputTokens,
      cachedTokens,
      reasoningTokens,
      outputTokens,
      totalTokens,
    },
    metadata,
  });

  return events;
}

function toEvents({
  event,
  metadata,
}: {
  event: ResponseStreamEvent;
  metadata: LLMClientMetadata;
}): LLMEvent[] {
  switch (event.type) {
    case "response.output_text.delta":
      return [textDelta(event.delta, metadata)];
    case "response.reasoning_summary_text.delta":
      return [reasoningDelta(event.delta, metadata)];
    case "response.completed":
      return responseCompleted(event.response, metadata);
    default:
      return [];
  }
}
