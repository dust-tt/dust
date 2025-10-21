import type {
  ResponseOutputItem,
  ResponseOutputItemDoneEvent,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { Response } from "openai/resources/responses/responses";

import type {
  LLMOutputItem,
  ProviderMetadata,
} from "@app/lib/api/llm/types/events";
import type { LLMEvent } from "@app/lib/api/llm/types/events";

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
          id: item.call_id,
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

function reaponseOutputItemToLLMOutputItem(
  item: ResponseOutputItem,
  metadata: ProviderMetadata
): LLMOutputItem | undefined {
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
          id: item.call_id,
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
      return undefined;
  }
}

function responseCompleted(
  response: Response,
  metadata: ProviderMetadata
): LLMEvent[] {
  const outputItems: LLMOutputItem[] = response.output
    .map((item) => reaponseOutputItemToLLMOutputItem(item, metadata))
    .filter((item): item is LLMOutputItem => item !== undefined);
  const events: LLMEvent[] = [];
  events.push(...outputItems);

  if (response.usage) {
    events.push({
      type: "token_usage",
      content: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.total_tokens,
      },
      metadata,
    });
  }
  events.push({
    type: "success",
    content: outputItems,
    metadata,
  });
  return events;
}

export function toEvents({
  event,
  metadata,
}: {
  event: ResponseStreamEvent;
  metadata: ProviderMetadata;
}): LLMEvent[] {
  const events: LLMEvent[] = [];

  switch (event.type) {
    case "response.output_text.delta":
      events.push(textDelta(event.delta, metadata));
      break;
    case "response.reasoning_summary_text.delta":
      events.push(reasoningDelta(event.delta, metadata));
      break;
    case "response.output_item.done":
      events.push(...toolCall(event, metadata));
      break;
    case "response.completed":
      events.push(...responseCompleted(event.response, metadata));
      break;
    default:
      break;
  }
  return events;
}
