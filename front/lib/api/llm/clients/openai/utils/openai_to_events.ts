import compact from "lodash/compact";
import type {
  ResponseOutputItem,
  ResponseOutputItemDoneEvent,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { Response } from "openai/resources/responses/responses";

import type { ProviderMetadata } from "@app/lib/api/llm/types/events";
import type { LLMEvent } from "@app/lib/api/llm/types/events";

export async function* streamLLMEvents(
  responseStreamEvents: AsyncIterable<ResponseStreamEvent>,
  metadata: ProviderMetadata
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

function textDelta(delta: string, metadata: ProviderMetadata): LLMEvent {
  return {
    type: "text_delta",
    content: {
      delta,
    },
    metadata,
  };
}

function reasoningDelta(delta: string, metadata: ProviderMetadata): LLMEvent {
  return {
    type: "reasoning_delta",
    content: {
      delta,
    },
    metadata,
  };
}

function toolCall(
  event: ResponseOutputItemDoneEvent,
  metadata: ProviderMetadata
): LLMEvent[] {
  const events: LLMEvent[] = [];
  const item = event.item;

  switch (item.type) {
    case "function_call":
      events.push({
        type: "tool_call",
        content: {
          id: extractCallId(item.call_id),
          name: item.name,
          arguments: item.arguments,
        },
        metadata,
      });
      break;
    default:
      break;
  }
  return events;
}

function itemToEvent(
  item: ResponseOutputItem,
  metadata: ProviderMetadata
): LLMEvent {
  switch (item.type) {
    case "message":
      return {
        type: "text_generated",
        content: {
          text: item.content
            .map((content) => {
              if (content.type === "output_text") {
                return content.text;
              }
              return "";
            })
            .join("\n"),
        },
        metadata,
      };
    case "function_call":
      return {
        type: "tool_call",
        content: {
          id: extractCallId(item.call_id),
          name: item.name,
          arguments: item.arguments,
        },
        metadata,
      };
    case "reasoning":
      return {
        type: "reasoning_generated",
        content: {
          text: item.summary.map((summary) => summary.text).join("\n"),
        },
        metadata,
      };
    default:
      throw Error(`Unsupported OpenAI Response Item: ${item}`);
  }
}

function responseCompleted(
  response: Response,
  metadata: ProviderMetadata
): LLMEvent[] {
  const events: LLMEvent[] = compact(
    response.output.map((i) => itemToEvent(i, metadata))
  );

  if (response.usage) {
    const {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
    } = response.usage;
    const { cached_tokens: cachedTokens } = response.usage.input_tokens_details;
    const { reasoning_tokens: reasoningTokens } =
      response.usage.output_tokens_details;
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
  }
  return events;
}

function extractCallId(id: string): string {
  if (id.startsWith("fc_")) {
    return id.slice(3);
  } else if (id.startsWith("call_")) {
    return id.slice(5);
  } else {
    return id;
  }
}

function toEvents({
  event,
  metadata,
}: {
  event: ResponseStreamEvent;
  metadata: ProviderMetadata;
}): LLMEvent[] {
  switch (event.type) {
    case "response.output_text.delta":
      return [textDelta(event.delta, metadata)];
    case "response.reasoning_summary_text.delta":
      return [reasoningDelta(event.delta, metadata)];
    // case "response.output_item.done":
    //   return toolCall(event, metadata);
    case "response.completed":
      return responseCompleted(event.response, metadata);
    default:
      return [];
  }
}
