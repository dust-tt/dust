import { createAsyncGenerator } from "@app/lib/api/llm/utils";
import * as converters from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import {
  outputItemToEvents,
  rawOutputToEvents,
  streamErrorToErrorEvent,
  usageToTokenUsageEvent,
} from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import { APIConnectionError } from "openai";
import type {
  Response,
  ResponseOutputItem,
  ResponseStreamEvent,
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
  it("preserves an id-bearing reasoning item with no visible summary", () => {
    const item = {
      type: "reasoning",
      id: "rs_empty",
      summary: [],
      status: "completed",
    } satisfies ResponseOutputItem;

    expect(outputItemToEvents(item, metadata, converters)).toEqual([
      {
        type: "reasoning",
        content: { value: "" },
        metadata: {
          ...metadata,
          content: { id: "rs_empty" },
        },
      },
    ]);
  });

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

function completedResponse(
  serviceTier: Response["service_tier"],
  usage: ResponseUsage
): Response {
  return {
    id: "resp_1",
    created_at: 0,
    output_text: "",
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    model: "gpt-5.6-terra",
    object: "response",
    output: [],
    parallel_tool_calls: false,
    temperature: null,
    tool_choice: "auto",
    tools: [],
    top_p: null,
    status: "completed",
    service_tier: serviceTier,
    usage,
  };
}

describe("rawOutputToEvents", () => {
  it("attributes an in-band error event to the provider", async () => {
    const events = [];
    for await (const event of rawOutputToEvents(
      createAsyncGenerator([
        {
          type: "error",
          code: "server_error",
          message: "generation failed",
          param: null,
          sequence_number: 0,
        },
      ]),
      metadata,
      converters
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      expect.objectContaining({
        type: "error",
        content: expect.objectContaining({
          type: "stream_error",
          errorSource: "provider",
        }),
      }),
    ]);
  });

  it.each([
    ["server_error", "server_error", "provider"],
    ["rate_limit_exceeded", "rate_limit_error", "dust"],
    ["invalid_prompt", "invalid_request_error", "dust"],
    ["bio_policy", "refusal_error", "dust"],
  ] as const)("maps response.failed code %s to %s from %s", async (code, expectedType, errorSource) => {
    const events = [];
    for await (const event of rawOutputToEvents(
      createAsyncGenerator([
        {
          type: "response.failed",
          sequence_number: 0,
          response: {
            ...completedResponse(null, {
              input_tokens: 0,
              input_tokens_details: {
                cached_tokens: 0,
                cache_write_tokens: 0,
              },
              output_tokens: 0,
              output_tokens_details: { reasoning_tokens: 0 },
              total_tokens: 0,
            }),
            status: "failed",
            error: { code, message: "generation failed" },
          },
        },
      ]),
      metadata,
      converters
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      expect.objectContaining({
        type: "error",
        content: expect.objectContaining({
          type: expectedType,
          errorSource,
        }),
      }),
    ]);
  });

  // The tier the response was served on is what OpenAI bills, and it can differ
  // from the one we asked for: a refused flex request is replayed on standard
  // processing. OpenAI's own tier names collapse into the two provider-agnostic
  // ones, since flex is the only tier that changes the rate.
  it.each([
    { reportedTier: "flex", serviceTier: "flex" },
    { reportedTier: "default", serviceTier: "default" },
    { reportedTier: "scale", serviceTier: "default" },
    { reportedTier: "priority", serviceTier: "default" },
  ] as const)("reports $reportedTier as the $serviceTier tier", async ({
    reportedTier,
    serviceTier,
  }) => {
    const events = [];
    for await (const event of rawOutputToEvents(
      createAsyncGenerator([
        {
          type: "response.completed",
          sequence_number: 0,
          response: completedResponse(reportedTier, {
            input_tokens: 10,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
            output_tokens: 5,
            output_tokens_details: { reasoning_tokens: 0 },
            total_tokens: 15,
          }),
        },
      ]),
      metadata,
      converters
    )) {
      events.push(event);
    }

    expect(events.find((event) => event.type === "token_usage")).toMatchObject({
      content: { serviceTier },
    });
  });

  it("omits the tier when the response does not report one", async () => {
    const events = [];
    for await (const event of rawOutputToEvents(
      createAsyncGenerator([
        {
          type: "response.completed",
          sequence_number: 0,
          response: completedResponse(null, {
            input_tokens: 10,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
            output_tokens: 5,
            output_tokens_details: { reasoning_tokens: 0 },
            total_tokens: 15,
          }),
        },
      ]),
      metadata,
      converters
    )) {
      events.push(event);
    }

    const usageEvent = events.find((event) => event.type === "token_usage");
    expect(usageEvent).toBeDefined();
    expect(usageEvent?.content).not.toHaveProperty("serviceTier");
  });

  it("preserves blank lines between streamed reasoning summary parts", async () => {
    const firstSummary = "**Verifying model usage by region**";
    const secondSummary = "**Investigating workspace region data**";
    const rawEvents: ResponseStreamEvent[] = [
      {
        type: "response.reasoning_summary_part.added",
        item_id: "rs_1",
        output_index: 0,
        summary_index: 0,
        sequence_number: 0,
        part: { type: "summary_text", text: "" },
      },
      {
        type: "response.reasoning_summary_text.delta",
        item_id: "rs_1",
        output_index: 0,
        summary_index: 0,
        sequence_number: 1,
        delta: firstSummary,
      },
      {
        type: "response.reasoning_summary_part.added",
        item_id: "rs_1",
        output_index: 0,
        summary_index: 1,
        sequence_number: 2,
        part: { type: "summary_text", text: "" },
      },
      {
        type: "response.reasoning_summary_text.delta",
        item_id: "rs_1",
        output_index: 0,
        summary_index: 1,
        sequence_number: 3,
        delta: secondSummary,
      },
      {
        type: "response.output_item.done",
        output_index: 0,
        sequence_number: 4,
        item: {
          type: "reasoning",
          id: "rs_1",
          summary: [
            { type: "summary_text", text: firstSummary },
            { type: "summary_text", text: secondSummary },
          ],
          status: "completed",
        },
      },
    ];
    const events = [];
    for await (const event of rawOutputToEvents(
      createAsyncGenerator(rawEvents),
      metadata,
      converters
    )) {
      events.push(event);
    }

    const streamedReasoning = events
      .filter((event) => event.type === "reasoning_delta")
      .map((event) => event.content.value)
      .join("");
    const completedReasoning = events.find(
      (event) => event.type === "reasoning"
    );

    expect(streamedReasoning).toBe(`${firstSummary}\n\n${secondSummary}`);
    expect(completedReasoning).toMatchObject({
      content: { value: streamedReasoning },
    });
  });

  it("preserves interleaved reasoning and function-call item order", async () => {
    const rawEvents: ResponseStreamEvent[] = [
      {
        type: "response.output_item.done",
        output_index: 0,
        sequence_number: 0,
        item: {
          type: "reasoning",
          id: "rs_1",
          summary: [{ type: "summary_text", text: "first thought" }],
          status: "completed",
        },
      },
      {
        type: "response.output_item.done",
        output_index: 1,
        sequence_number: 1,
        item: {
          type: "function_call",
          id: "fc_1",
          call_id: "call_1",
          name: "first_tool",
          arguments: "{}",
          status: "completed",
        },
      },
      {
        type: "response.output_item.done",
        output_index: 2,
        sequence_number: 2,
        item: {
          type: "reasoning",
          id: "rs_2",
          summary: [{ type: "summary_text", text: "second thought" }],
          status: "completed",
        },
      },
      {
        type: "response.output_item.done",
        output_index: 3,
        sequence_number: 3,
        item: {
          type: "function_call",
          id: "fc_2",
          call_id: "call_2",
          name: "second_tool",
          arguments: "{}",
          status: "completed",
        },
      },
    ];
    const events = [];
    for await (const event of rawOutputToEvents(
      createAsyncGenerator(rawEvents),
      metadata,
      converters
    )) {
      events.push(event);
    }

    expect(events.at(-1)).toMatchObject({
      type: "success",
      content: {
        aggregated: [
          {
            type: "reasoning",
            content: { value: "first thought" },
            metadata: { content: { id: "rs_1" } },
          },
          {
            type: "tool_call",
            content: { id: "call_1", name: "first_tool" },
          },
          {
            type: "reasoning",
            content: { value: "second thought" },
            metadata: { content: { id: "rs_2" } },
          },
          {
            type: "tool_call",
            content: { id: "call_2", name: "second_tool" },
          },
        ],
      },
    });
  });
});

describe("streamErrorToErrorEvent", () => {
  // The shared OpenAI helper is covered exhaustively by the completions tests;
  // keep one adapter-level assertion that Responses delegates transport errors.
  it("maps APIConnectionError to a network_error without blaming the provider", () => {
    const result = streamErrorToErrorEvent(
      metadata,
      new APIConnectionError({ message: "connection reset" })
    );
    expect(result.content.type).toBe("network_error");
    expect(result.content.errorSource).toBe("unknown");
  });
});
