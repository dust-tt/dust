import {
  rawOutputToEvents,
  usageToTokenUsageEvent,
} from "@app/lib/model_constructors/sdk/mistralai/converters/output/utils";
import type {
  CompletionEvent,
  ToolCall,
  UsageInfo,
} from "@mistralai/mistralai/models/components";
import { describe, expect, it } from "vitest";

const metadata = {
  lab: "mistral",
  host: "mistral",
  model: "mistral-medium-3-5",
  region: "eu",
} as const;

function usage(extra: Record<string, unknown>): UsageInfo {
  return { promptTokens: 7020, completionTokens: 8, ...extra };
}

describe("usageToTokenUsageEvent", () => {
  it("credits cached reads reported under the raw wire name", () => {
    const event = usageToTokenUsageEvent(
      metadata,
      usage({ prompt_tokens_details: { cached_tokens: 6912 } })
    );

    expect(event.content.cacheHit).toBe(6912);
    expect(event.content.standardInput).toBe(108);
  });

  it("credits cached reads if a later SDK declares the field camelCased", () => {
    const event = usageToTokenUsageEvent(
      metadata,
      usage({ promptTokensDetails: { cachedTokens: 6912 } })
    );

    expect(event.content.cacheHit).toBe(6912);
    expect(event.content.standardInput).toBe(108);
  });

  it("bills every prompt token as standard input on a cache miss", () => {
    const event = usageToTokenUsageEvent(
      metadata,
      usage({ prompt_tokens_details: { cached_tokens: 0 } })
    );

    expect(event.content.cacheHit).toBe(0);
    expect(event.content.standardInput).toBe(7020);
  });

  it("bills every prompt token as standard input when no breakdown is sent", () => {
    const event = usageToTokenUsageEvent(metadata, usage({}));

    expect(event.content.cacheHit).toBe(0);
    expect(event.content.standardInput).toBe(7020);
  });

  it("never reports cache writes, which Mistral does not bill separately", () => {
    const event = usageToTokenUsageEvent(
      metadata,
      usage({ prompt_tokens_details: { cached_tokens: 6912 } })
    );

    expect(event.content.cacheCreated).toBe(0);
    expect(event.content.shortCacheCreated).toBe(0);
    expect(event.content.longCacheCreated).toBe(0);
  });
});

function toolCallChunk(
  toolCall: ToolCall,
  finishReason?: string
): CompletionEvent {
  return {
    data: {
      id: "cmpl",
      model: "zai-glm-5-3",
      choices: [
        {
          index: 0,
          delta: { toolCalls: [toolCall] },
          finishReason: finishReason ?? null,
        },
      ],
    },
  } as CompletionEvent;
}

async function* streamOf(events: CompletionEvent[]) {
  yield* events;
}

describe("rawOutputToEvents", () => {
  it("merges a tool call streamed across deltas into one call", async () => {
    // Deltas captured from GLM-5.3 on Mistral EU (2026-09-28): continuation
    // chunks carry `id: "null"` and an empty name.
    const stream = streamOf([
      toolCallChunk({
        id: "call_1",
        index: 0,
        function: { name: "websearch", arguments: "" },
      }),
      toolCallChunk({
        id: "null",
        index: 0,
        function: { name: "", arguments: '{"query": "Paris' },
      }),
      toolCallChunk(
        {
          id: "null",
          index: 0,
          function: { name: "", arguments: ' weather"}' },
        },
        "tool_calls"
      ),
    ]);

    const toolCalls = [];
    for await (const event of rawOutputToEvents(stream, metadata)) {
      if (event.type === "tool_call") {
        toolCalls.push(event.content);
      }
    }

    expect(toolCalls).toEqual([
      {
        id: "call_1",
        name: "websearch",
        arguments: { query: "Paris weather" },
      },
    ]);
  });
});
