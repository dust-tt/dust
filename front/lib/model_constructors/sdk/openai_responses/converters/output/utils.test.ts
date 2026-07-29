import * as converters from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import {
  outputItemToEvents,
  usageToTokenUsageEvent,
} from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import type {
  ResponseOutputItem,
  ResponseUsage,
} from "openai/resources/responses/responses";
import { describe, expect, it } from "vitest";

const metadata = {
  lab: "openai",
  host: "openai-responses",
  model: "gpt-5.4",
  region: "global",
} as const;

describe("outputItemToEvents", () => {
  it("preserves a discovered function call namespace", () => {
    const item = {
      type: "function_call",
      id: "fc_123",
      call_id: "call_123",
      name: "get_weather",
      namespace: "weather",
      arguments: "{}",
      status: "completed",
    } satisfies ResponseOutputItem;

    expect(outputItemToEvents(item, metadata, converters)).toEqual([
      {
        type: "tool_call",
        content: {
          id: "call_123",
          name: "get_weather",
          arguments: {},
          namespace: "weather",
        },
        metadata,
      },
    ]);
  });

  it.each<ResponseOutputItem>([
    {
      type: "tool_search_call",
      id: "ts_123",
      call_id: null,
      execution: "server",
      status: "completed",
      arguments: { paths: ["weather"] },
    },
    {
      type: "tool_search_output",
      id: "tso_123",
      call_id: null,
      execution: "server",
      status: "completed",
      tools: [
        {
          type: "function",
          name: "get_weather",
          description: "Get the current weather",
          parameters: { type: "object", properties: {} },
          strict: false,
          defer_loading: true,
        },
      ],
    },
  ])("preserves $type as provider passthrough", (item) => {
    expect(outputItemToEvents(item, metadata, converters)).toEqual([
      {
        type: "provider_passthrough",
        content: { provider: "openai", block: item },
        metadata,
      },
    ]);
  });
});

describe("usageToTokenUsageEvent", () => {
  it("splits standard input, cache reads, and cache writes", () => {
    const usage: ResponseUsage = {
      input_tokens: 2006,
      input_tokens_details: {
        cached_tokens: 1200,
        cache_write_tokens: 720,
      },
      output_tokens: 300,
      output_tokens_details: { reasoning_tokens: 50 },
      total_tokens: 2306,
    };

    expect(usageToTokenUsageEvent(metadata, usage)).toEqual({
      type: "token_usage",
      content: {
        cacheCreated: 720,
        longCacheCreated: 0,
        shortCacheCreated: 0,
        cacheHit: 1200,
        standardInput: 86,
        totalOutput: 300,
        reasoning: 50,
      },
      metadata,
    });
  });
});
