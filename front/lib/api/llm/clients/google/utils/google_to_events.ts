import type { GenerateContentResponse, Part } from "@google/genai";
import { FinishReason } from "@google/genai";
import assert from "assert";
import { hash as blake3 } from "blake3";
import crypto from "crypto";

import type { LLMEvent, ProviderMetadata } from "@app/lib/api/llm/types/events";

function newId(): string {
  const uuid = crypto.randomUUID();
  return blake3(uuid).toString("hex");
}

export async function* streamLLMEvents({
  generateContentResponses,
  metadata,
}: {
  generateContentResponses: AsyncIterable<GenerateContentResponse>;
  metadata: ProviderMetadata;
}): AsyncGenerator<LLMEvent> {
  // Google does not send a "report" with concatenated text chunks
  // So we have to aggregate it ourselves as we receive text chunks
  let textContentParts = "";
  let reasoningContentParts = "";

  function* yieldEvents(events: LLMEvent[]) {
    for (const event of events) {
      if (event.type === "text_delta") {
        textContentParts += event.content.delta;
      }
      if (event.type === "reasoning_delta") {
        reasoningContentParts += event.content.delta;
      }
      yield event;
    }
  }

  for await (const generateContentResponse of generateContentResponses) {
    assert(
      generateContentResponse.candidates &&
        generateContentResponse.candidates.length > 0,
      "Expected at least one candidate in the response"
    );

    const candidate = generateContentResponse.candidates[0];

    const { content, finishReason } = candidate;

    assert(
      !!finishReason || (content && content.parts && content.parts.length > 0),
      "Candidate either finishReason or content parts are required"
    );

    const events = (content?.parts ?? []).map((part) =>
      partToLLMEvent({ part, metadata })
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
          yield {
            type: "reasoning_generated" as const,
            content: { text: reasoningContentParts },
            metadata,
          };
        }
        reasoningContentParts = "";
        if (textContentParts) {
          yield {
            type: "text_generated" as const,
            content: { text: textContentParts },
            metadata,
          };
        }
        textContentParts = "";
        break;
      }
      default: {
        // yield error event after all received events
        yield* yieldEvents(events);
        reasoningContentParts = "";
        textContentParts = "";
        yield {
          type: "error" as const,
          content: {
            message: "An error occurred during completion",
            code: 500,
          },
          metadata,
        };
        break;
      }
    }
  }
}

function textPartToEvent({
  part,
  metadata,
}: {
  part: { text: string; thought?: boolean };
  metadata: ProviderMetadata;
}): LLMEvent {
  const { text, thought } = part;

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
    metadata,
  };
}

function partToLLMEvent({
  part,
  metadata,
}: {
  part: Part;
  metadata: ProviderMetadata;
}): LLMEvent {
  // Exactly one "structuring" field within a Part should be set
  if (part.text) {
    const { text, thought } = part;
    return textPartToEvent({
      part: { text, thought },
      metadata,
    });
  }

  if (part.functionCall) {
    const {
      // Google does not necessarily return an id, so we generate one if missing
      functionCall: { id = `fc_${newId().slice(0, 9)}`, name, args },
    } = part;

    assert(
      id && name && args,
      `Function call must have name and arguments, ${JSON.stringify({ id, name, args })} found instead`
    );

    return {
      type: "tool_call",
      content: {
        id,
        name,
        // TODO(LLM-Router 2025-10-27): set arguments type as Record<string, unknown
        arguments: JSON.stringify(args),
      },
      metadata,
    };
  }

  throw new Error("Unhandled part type in Google GenAI response");
}
