import flatMap from "lodash/flatMap";
import type {
  Response,
  ResponseOutputItem,
  ResponseOutputRefusal,
  ResponseOutputText,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

import { SuccessAggregate } from "@app/lib/api/llm/types/aggregates";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { parseToolArguments } from "@app/lib/api/llm/utils/tool_arguments";
import { assertNever } from "@app/types";

export async function* streamLLMEvents(
  responseStreamEvents: AsyncIterable<ResponseStreamEvent>,
  metadata: LLMClientMetadata
): AsyncGenerator<LLMEvent> {
  const aggregate = new SuccessAggregate();

  for await (const event of responseStreamEvents) {
    const outputEvents = toEvents({
      event,
      metadata,
    });
    for (const outputEvent of outputEvents) {
      aggregate.add(outputEvent);
      yield outputEvent;
    }
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

function textDelta(delta: string, metadata: LLMClientMetadata): LLMEvent {
  return {
    type: "text_delta",
    content: {
      delta,
    },
    metadata,
  };
}

function responseId(id: string, metadata: LLMClientMetadata): LLMEvent {
  return {
    type: "interaction_id",
    content: {
      modelInteractionId: id,
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
    case "function_call": {
      return [
        {
          type: "tool_call",
          content: {
            id: item.call_id,
            name: item.name,
            arguments: parseToolArguments(item.arguments, item.name),
          },
          metadata,
        },
      ];
    }
    case "reasoning":
      const encrypted_content = item.encrypted_content ?? undefined;
      // OpenAI sometimes sends multiple summary blocks in a single reasoning item.
      // Concatenate them into a single reasoning_generated event to ensure proper handling.
      // We cannot split it into several reasoning_generated events because we would have multiple events with the same ID
      // which is not supported by OpenAI.
      const concatenatedSummary = item.summary
        .map((summary) => summary.text)
        .join("\n\n");
      return [
        {
          type: "reasoning_generated",
          content: {
            text: concatenatedSummary,
          },
          metadata: { ...metadata, id: item.id, encrypted_content },
        },
      ];
    default:
      throw new EventError(
        {
          type: "invalid_response_error",
          message: `Unsupported OpenAI Response Item: ${item}`,
          isRetryable: false,
        },
        metadata
      );
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
  // NB: OpenAI API does not return the number of cache writes
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
    case "response.created":
      return [responseId(event.response.id, metadata)];
    case "response.output_text.delta":
      return [textDelta(event.delta, metadata)];
    case "response.reasoning_summary_text.delta":
      return [reasoningDelta(event.delta, metadata)];
    case "response.completed":
      return responseCompleted(event.response, metadata);
    case "response.reasoning_summary_part.added": {
      if (event.summary_index === 0) {
        return [];
      }

      return [reasoningDelta("\n\n", metadata)];
    }
    default:
      return [];
  }
}
