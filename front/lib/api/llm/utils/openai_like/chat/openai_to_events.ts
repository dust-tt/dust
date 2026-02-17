import { SuccessAggregate } from "@app/lib/api/llm/types/aggregates";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { parseToolArguments } from "@app/lib/api/llm/utils/tool_arguments";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";

export async function* streamLLMEvents(
  chatCompletionStream: AsyncIterable<ChatCompletionChunk>,
  metadata: LLMClientMetadata
): AsyncGenerator<LLMEvent> {
  const aggregate = new SuccessAggregate();
  let textDelta = "";
  let reasoningDelta = "";
  const toolCalls: Map<
    number,
    { id: string; name: string; arguments: string }
  > = new Map();
  let hasYieldedResponseId = false;
  let hasError = false;

  for await (const chunk of chatCompletionStream) {
    if (!hasYieldedResponseId) {
      const event: LLMEvent = {
        type: "interaction_id",
        content: {
          modelInteractionId: chunk.id,
        },
        metadata,
      };
      yield event;
      hasYieldedResponseId = true;
    }

    const choice = chunk.choices[0];
    if (!choice) {
      continue;
    }
    const delta = choice.delta;

    // @ts-expect-error reasoning_content is not in the standard OpenAI types
    const eventReasoningDeltaContent = delta.reasoning_content as unknown;

    // Handle reasoning content (Kimi K2.5 and other models with thinking/reasoning).
    // Preserve all reasoning deltas including whitespace - only filter in reasoning_generated.
    if (isString(eventReasoningDeltaContent)) {
      reasoningDelta += eventReasoningDeltaContent;
      const event: LLMEvent = {
        type: "reasoning_delta",
        content: {
          delta: eventReasoningDeltaContent,
        },
        metadata,
      };
      yield event;
    }

    // Handle text content (only if non-whitespace).
    if (delta.content) {
      textDelta += delta.content;
      const event: LLMEvent = {
        type: "text_delta",
        content: {
          delta: delta.content,
        },
        metadata,
      };
      yield event;
    }

    // Handle tool calls.
    if (delta.tool_calls) {
      for (const toolCallDelta of delta.tool_calls) {
        const index = toolCallDelta.index;

        // Initialize tool call entry if it doesn't exist
        if (!toolCalls.has(index)) {
          toolCalls.set(index, {
            id: "",
            name: "",
            arguments: "",
          });
        }

        const toolCall = toolCalls.get(index)!;

        // Update fields that are present in this delta
        if (toolCallDelta.id) {
          toolCall.id = toolCallDelta.id;
        }
        if (toolCallDelta.function?.name) {
          toolCall.name += toolCallDelta.function.name;
        }
        if (toolCallDelta.function?.arguments) {
          toolCall.arguments += toolCallDelta.function.arguments;
        }
      }
      yield { type: "tool_call_delta", metadata };
    }

    // Handle finish reason.
    if (choice.finish_reason) {
      if (chunk.usage) {
        // Token usage is sent when we receive the finish reason
        const tokenUsageEvent: LLMEvent = {
          type: "token_usage",
          content: {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
            cachedTokens: chunk.usage.prompt_tokens_details?.cached_tokens,
          },
          metadata,
        };
        aggregate.add(tokenUsageEvent);
        yield tokenUsageEvent;
      }
      switch (choice.finish_reason) {
        case "stop": {
          // Only yield reasoning_generated if there's non-whitespace content
          if (reasoningDelta && reasoningDelta.trim()) {
            const reasoningGeneratedEvent: LLMEvent = {
              type: "reasoning_generated",
              content: {
                text: reasoningDelta.trim(),
              },
              metadata: {
                ...metadata,
                encrypted_content: undefined,
              },
            };
            aggregate.add(reasoningGeneratedEvent);
            yield reasoningGeneratedEvent;
          }
          // Only yield text_generated if there's non-whitespace content
          if (textDelta && textDelta.trim()) {
            const textGeneratedEvent: LLMEvent = {
              type: "text_generated",
              content: {
                text: textDelta.trim(),
              },
              metadata,
            };
            aggregate.add(textGeneratedEvent);
            yield textGeneratedEvent;
          }
          break;
        }

        case "tool_calls": {
          // Only yield reasoning_generated if there's non-whitespace content
          if (reasoningDelta && reasoningDelta.trim()) {
            const reasoningGeneratedEvent: LLMEvent = {
              type: "reasoning_generated",
              content: {
                text: reasoningDelta,
              },
              metadata: {
                ...metadata,
                encrypted_content: undefined,
              },
            };
            aggregate.add(reasoningGeneratedEvent);
            yield reasoningGeneratedEvent;
          }
          // Only yield text_generated if there's non-whitespace content
          if (textDelta && textDelta.trim()) {
            const textGeneratedEvent: LLMEvent = {
              type: "text_generated",
              content: {
                text: textDelta,
              },
              metadata,
            };
            aggregate.add(textGeneratedEvent);
            yield textGeneratedEvent;
          }
          // Yield all tool calls.
          for (const toolCall of toolCalls.values()) {
            if (toolCall.id && toolCall.name) {
              const toolCallEvent: LLMEvent = {
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
              aggregate.add(toolCallEvent);
              yield toolCallEvent;
            }
          }
          break;
        }

        case "length": {
          hasError = true;
          const errorEvent = new EventError(
            {
              type: "maximum_length",
              isRetryable: false,
              message: "Maximum length reached",
            },
            metadata
          );
          yield errorEvent;
          break;
        }

        case "content_filter": {
          hasError = true;
          const errorEvent = new EventError(
            {
              type: "refusal_error",
              isRetryable: false,
              message: "Content filtered",
            },
            metadata
          );
          yield errorEvent;
          break;
        }

        case "function_call":
          // Function calls are handled via tool_calls deltas
          break;

        default:
          // Handle other finish reasons as needed
          assertNever(choice.finish_reason);
      }

      // Yield success event if no error occurred.
      if (!hasError) {
        const successEvent: LLMEvent = {
          type: "success",
          aggregated: aggregate.aggregated,
          textGenerated: aggregate.textGenerated,
          reasoningGenerated: aggregate.reasoningGenerated,
          toolCalls: aggregate.toolCalls,
          metadata,
        };
        yield successEvent;
      }
    }
  }
}
