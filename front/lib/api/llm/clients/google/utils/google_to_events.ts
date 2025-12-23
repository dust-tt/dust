import type {
  GenerateContentResponse,
  GenerateContentResponseUsageMetadata,
} from "@google/genai";
import { FinishReason } from "@google/genai";
import assert from "assert";
import { hash as blake3 } from "blake3";
import crypto from "crypto";
import flatMap from "lodash/flatMap";

import { SuccessAggregate } from "@app/lib/api/llm/types/aggregates";
import type { LLMEvent, TokenUsageEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";

function newId(): string {
  const uuid = crypto.randomUUID();
  return blake3(uuid).toString("hex");
}

type StateContainer = {
  thinkingSignature?: string;
};

export async function* streamLLMEvents({
  generateContentResponses,
  metadata,
}: {
  generateContentResponses: AsyncIterable<GenerateContentResponse>;
  metadata: LLMClientMetadata;
}): AsyncGenerator<LLMEvent> {
  // Google does not send a "report" with concatenated text chunks
  // So we have to aggregate it ourselves as we receive text chunks
  let textContentParts = "";
  let reasoningContentParts = "";
  let hasYieldedResponseId = false;

  // Aggregate output items to build a SuccessCompletionEvent at the end of a turn.
  const aggregate = new SuccessAggregate();

  function* yieldEvents(events: LLMEvent[]) {
    for (const event of events) {
      if (event.type === "text_delta") {
        textContentParts += event.content.delta;
      }
      if (event.type === "reasoning_delta") {
        reasoningContentParts += event.content.delta;
      }

      aggregate.add(event);
      yield event;
    }
  }

  const stateContainer: StateContainer = {};
  for await (const generateContentResponse of generateContentResponses) {
    assert(
      generateContentResponse.candidates &&
        generateContentResponse.candidates.length > 0,
      "Expected at least one candidate in the response"
    );

    const modelInteractionId = generateContentResponse.responseId;
    if (!hasYieldedResponseId && modelInteractionId) {
      yield {
        type: "interaction_id",
        content: {
          modelInteractionId,
        },
        metadata,
      };
      hasYieldedResponseId = true;
    }

    const candidate = generateContentResponse.candidates[0];

    const { content, finishReason } = candidate;

    assert(
      !!finishReason || (content && content.parts && content.parts.length > 0),
      "Candidate either finishReason or content parts are required"
    );

    const events = flatMap(
      (content?.parts ?? []).map((part) => {
        if (part.functionCall) {
          const {
            // Google does not necessarily return an id, so we generate one if missing
            functionCall: { id = `fc_${newId().slice(0, 9)}`, name, args },
            thoughtSignature,
          } = part;

          assert(
            id && name && args,
            `Function call must have name and arguments, ${JSON.stringify({ id, name, args })} found instead`
          );

          const returnedEvents: LLMEvent[] = [];

          if (reasoningContentParts) {
            returnedEvents.push({
              type: "reasoning_generated" as const,
              content: { text: reasoningContentParts },
              metadata: {
                ...metadata,
                encrypted_content: stateContainer.thinkingSignature,
              },
            });

            reasoningContentParts = "";
          }

          if (textContentParts) {
            returnedEvents.push({
              type: "text_generated" as const,
              content: { text: textContentParts },
              metadata,
            });

            textContentParts = "";
          }

          returnedEvents.push({
            type: "tool_call",
            content: {
              id,
              name,
              arguments: args,
            },
            // Gemini 3 pro requires the thought signature to be sent back in subsequent requests
            metadata: { ...metadata, thoughtSignature },
          });

          return returnedEvents;
        }

        if (part.text === "") {
          return [];
        }

        if (part.text) {
          const { text, thought, thoughtSignature } = part;
          return [
            textPartToEvent(
              {
                part: { text, thought, thoughtSignature },
                metadata,
              },
              stateContainer
            ),
          ];
        }

        throw new Error("Unhandled part type in Google GenAI response");
      })
    );

    // Passthrough, keep streaming
    if (!candidate.finishReason) {
      yield* yieldEvents(events);
      continue;
    }

    switch (candidate.finishReason) {
      case FinishReason.STOP: {
        yield* yieldEvents(events);
        if (reasoningContentParts) {
          yield* yieldEvents([
            {
              type: "reasoning_generated" as const,
              content: { text: reasoningContentParts },
              metadata: {
                ...metadata,
                encrypted_content: stateContainer.thinkingSignature,
              },
            },
          ]);
        }
        reasoningContentParts = "";
        if (textContentParts) {
          yield* yieldEvents([
            {
              type: "text_generated" as const,
              content: { text: textContentParts },
              metadata,
            },
          ]);
        }
        textContentParts = "";
        yield tokenUsage(generateContentResponse.usageMetadata, metadata);
        // emit success event after token usage
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
      default: {
        // yield error event after all received events
        yield* yieldEvents(events);
        yield tokenUsage(generateContentResponse.usageMetadata, metadata);
        reasoningContentParts = "";
        textContentParts = "";
        yield* yieldEvents([
          new EventError(
            {
              type: "stop_error",
              isRetryable: false,
              message: "An error occurred during completion",
              originalError: { finishReason: candidate.finishReason },
            },
            metadata
          ),
        ]);
        break;
      }
    }
  }
}

function tokenUsage(
  usage: GenerateContentResponseUsageMetadata | undefined,
  metadata: LLMClientMetadata
): TokenUsageEvent {
  return {
    type: "token_usage",
    content: {
      // Google input usage is split between prompt and tool use
      // toolUsePromptTokenCount represents the number of tokens in the results
      // from tool executions, which are provided back to the model as input
      inputTokens:
        (usage?.promptTokenCount ?? 0) + (usage?.toolUsePromptTokenCount ?? 0),
      outputTokens: usage?.candidatesTokenCount ?? 0,
      totalTokens: usage?.totalTokenCount ?? 0,
      cachedTokens: usage?.cachedContentTokenCount,
      reasoningTokens: usage?.thoughtsTokenCount,
    },
    metadata,
  };
}

function textPartToEvent(
  {
    part,
    metadata,
  }: {
    part: { text: string; thought?: boolean; thoughtSignature?: string };
    metadata: LLMClientMetadata;
  },
  stateContainer: StateContainer
): LLMEvent {
  const { text, thought, thoughtSignature } = part;

  if (thoughtSignature) {
    stateContainer.thinkingSignature = thoughtSignature;
  }

  if (!thought) {
    return {
      type: "text_delta",
      content: { delta: text },
      metadata,
    };
  }

  return {
    type: "reasoning_delta",
    content: { delta: text },
    metadata: { ...metadata, encrypted_content: thoughtSignature },
  };
}
