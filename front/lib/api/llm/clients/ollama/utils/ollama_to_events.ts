import { SuccessAggregate } from "@app/lib/api/llm/types/aggregates";
import type { LLMEvent, TokenUsageEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { hash as blake3 } from "blake3";
import crypto from "crypto";
import type { ChatResponse } from "ollama";

function newId(): string {
  const uuid = crypto.randomUUID();
  return blake3(uuid).toString("hex");
}

export async function* streamLLMEvents({
  response,
  metadata,
}: {
  response: AsyncIterable<ChatResponse>;
  metadata: LLMClientMetadata;
}): AsyncGenerator<LLMEvent> {
  let textContent = "";
  let reasoningContent = "";
  let pendingToolCalls: NonNullable<ChatResponse["message"]["tool_calls"]> = [];

  const aggregate = new SuccessAggregate();

  function* yieldEvents(events: LLMEvent[]) {
    for (const event of events) {
      if (event.type === "text_delta") {
        textContent += event.content.delta;
      }
      if (event.type === "reasoning_delta") {
        reasoningContent += event.content.delta;
      }

      aggregate.add(event);
      yield event;
    }
  }

  for await (const chunk of response) {
    const { message, done, done_reason } = chunk;

    if (!done) {
      // Accumulate tool calls from non-final chunks (Ollama sends them here).
      if (message.tool_calls && message.tool_calls.length > 0) {
        pendingToolCalls = message.tool_calls;
      }

      // Stream reasoning delta
      if (message.thinking) {
        yield* yieldEvents([
          {
            type: "reasoning_delta",
            content: { delta: message.thinking },
            metadata,
          },
        ]);
      }

      // Stream text delta
      if (message.content) {
        yield* yieldEvents([
          {
            type: "text_delta",
            content: { delta: message.content },
            metadata,
          },
        ]);
      }

      continue;
    }

    // Final chunk: flush tool calls first (prefer final chunk's list, fall back to accumulated).
    const effectiveToolCalls = message.tool_calls?.length
      ? message.tool_calls
      : pendingToolCalls;
    if (effectiveToolCalls.length > 0) {
      if (reasoningContent) {
        yield* yieldEvents([
          {
            type: "reasoning_generated" as const,
            content: { text: reasoningContent },
            metadata,
          },
        ]);
        reasoningContent = "";
      }

      if (textContent) {
        yield* yieldEvents([
          {
            type: "text_generated" as const,
            content: { text: textContent.trim() },
            metadata,
          },
        ]);
        textContent = "";
      }

      for (const toolCall of effectiveToolCalls) {
        const id = `fc_${newId().slice(0, 9)}`;
        const { name, arguments: args } = toolCall.function;

        yield* yieldEvents([
          {
            type: "tool_call",
            content: { id, name: name ?? "", arguments: args ?? {} },
            metadata,
          },
        ]);
      }
    }

    // Final chunk: handle done_reason
    switch (done_reason) {
      case "stop":
      case "tool_calls": {
        if (reasoningContent) {
          yield* yieldEvents([
            {
              type: "reasoning_generated" as const,
              content: { text: reasoningContent },
              metadata,
            },
          ]);
          reasoningContent = "";
        }

        if (textContent) {
          yield* yieldEvents([
            {
              type: "text_generated" as const,
              content: { text: textContent.trim() },
              metadata,
            },
          ]);
          textContent = "";
        }

        yield tokenUsage(chunk, metadata);
        yield {
          type: "success",
          aggregated: aggregate.aggregated,
          textGenerated: aggregate.textGenerated,
          reasoningGenerated: aggregate.reasoningGenerated,
          toolCalls: aggregate.toolCalls,
          metadata,
        };
        break;
      }

      case "length": {
        yield new EventError(
          {
            type: "stop_error",
            isRetryable: true,
            message: "The maximum response length was reached",
            originalError: { done_reason },
          },
          metadata
        );
        break;
      }

      default: {
        yield new EventError(
          {
            type: "unknown_error",
            isRetryable: false,
            message: `Unexpected done_reason: ${done_reason}`,
            originalError: { done_reason },
          },
          metadata
        );
        break;
      }
    }
  }

}

function tokenUsage(
  chunk: ChatResponse,
  metadata: LLMClientMetadata
): TokenUsageEvent {
  return {
    type: "token_usage",
    content: {
      inputTokens: chunk.prompt_eval_count ?? 0,
      outputTokens: chunk.eval_count ?? 0,
      totalTokens: (chunk.prompt_eval_count ?? 0) + (chunk.eval_count ?? 0),
    },
    metadata,
  };
}
