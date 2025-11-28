import type { ChatCompletionChunk } from "openai/resources/chat/completions";

import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { parseToolArguments } from "@app/lib/api/llm/utils/tool_arguments";
import { assertNever } from "@app/types";

export async function* streamLLMEvents(
  chatCompletionStream: AsyncIterable<ChatCompletionChunk>,
  metadata: LLMClientMetadata
): AsyncGenerator<LLMEvent> {
  let textDelta = "";
  const toolCalls: Map<
    number,
    { id: string; name: string; arguments: string }
  > = new Map();
  let hasYieldedResponseId = false;

  for await (const chunk of chatCompletionStream) {
    if (!hasYieldedResponseId) {
      yield {
        type: "interaction_id",
        content: {
          modelInteractionId: chunk.id,
        },
        metadata,
      };
      hasYieldedResponseId = true;
    }

    const choice = chunk.choices[0];
    if (!choice) {
      continue;
    }
    const delta = choice.delta;

    // Handle text content.
    // Note: In Chat Completions API, reasoning tokens are part of the text delta
    if (delta.content) {
      textDelta += delta.content;
      yield {
        type: "text_delta",
        content: {
          delta: delta.content,
        },
        metadata,
      };
    }

    // Handle tool calls.
    if (delta.tool_calls) {
      for (const toolCallDelta of delta.tool_calls) {
        const index = toolCallDelta.index;
        const existing = toolCalls.get(index);

        if (toolCallDelta.id) {
          toolCalls.set(index, {
            id: toolCallDelta.id,
            name: toolCallDelta.function?.name ?? "",
            arguments: toolCallDelta.function?.arguments ?? "",
          });
        } else if (existing && toolCallDelta.function?.arguments) {
          existing.arguments += toolCallDelta.function.arguments;
        } else if (existing && toolCallDelta.function?.name) {
          existing.name += toolCallDelta.function.name;
        }
      }
    }

    // Handle finish reason.
    if (choice.finish_reason) {
      if (chunk.usage) {
        // Token usage is sent when we receive the finish reason
        yield {
          type: "token_usage",
          content: {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
            cachedTokens: chunk.usage.prompt_tokens_details?.cached_tokens,
          },
          metadata,
        };
      }
      switch (choice.finish_reason) {
        case "stop":
          if (textDelta) {
            yield {
              type: "text_generated",
              content: {
                text: textDelta,
              },
              metadata,
            };
          }
          break;

        case "tool_calls":
          if (textDelta) {
            yield {
              type: "text_generated",
              content: {
                text: textDelta,
              },
              metadata,
            };
          }
          // Yield all tool calls.
          for (const toolCall of toolCalls.values()) {
            if (toolCall.id && toolCall.name) {
              yield {
                type: "tool_call",
                content: {
                  id: toolCall.id,
                  name: toolCall.name,
                  arguments: parseToolArguments(
                    toolCall.arguments,
                    toolCall.name
                  ),
                },
                metadata,
              };
            }
          }
          break;

        case "length":
          yield new EventError(
            {
              type: "maximum_length",
              isRetryable: false,
              message: "Maximum length reached",
            },
            metadata
          );
          break;

        case "content_filter":
          yield new EventError(
            {
              type: "refusal_error",
              isRetryable: false,
              message: "Content filtered",
            },
            metadata
          );
          break;

        case "function_call":
          // Function calls are handled via tool_calls deltas
          break;

        default:
          // Handle other finish reasons as needed
          assertNever(choice.finish_reason);
      }
    }
  }
}
