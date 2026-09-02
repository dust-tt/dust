import { getBatchLLM, getStreamLLM } from "@app/lib/api/llm";
import { LLMRunLifecycle } from "@app/lib/api/llm/run_lifecycle";
import { createLLMTraceId } from "@app/lib/api/llm/traces/buffer";
import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import type { BatchResult } from "@app/lib/api/llm/types/batch";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import { DustOpenAIGptFiveDotFiveEuropeOpenAIResponsesBatch } from "@app/lib/llms/batch/endpoints/openai_gpt_five_dot_five_eu_openai_responses";
import { DustNoopNoopGlobalNoopStream } from "@app/lib/llms/stream/endpoints/noop_noop_global_noop";
import { DustOpenAIGptFiveDotFiveEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_five_eu_openai_responses";
import { DustOpenAIGptFiveDotFiveGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_five_global_openai_responses";
import {
  USAGE_TYPE_FREE,
  USAGE_TYPE_PROGRAMMATIC,
  USAGE_TYPE_USER,
} from "@app/lib/metronome/constants";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import { RunResource } from "@app/lib/resources/run_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import {
  GPT_5_6_LUNA_MODEL_CONFIG,
  GPT_5_MINI_MODEL_CONFIG,
} from "@app/types/assistant/models/openai";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

class ThrowingNoopStream extends DustNoopNoopGlobalNoopStream {
  override async *streamRaw(): AsyncGenerator<string> {
    throw Object.assign(new Error("Provider failed before reporting usage"), {
      status: 503,
    });
  }
}

class IncompleteNoopStream extends DustNoopNoopGlobalNoopStream {
  override async *rawStreamOutputToEvents(): AsyncGenerator<ModelResponseEvent> {
    yield {
      type: "text_delta",
      content: { value: "partial" },
      metadata: this.metadata(),
    };
  }
}

class ImmediateProviderErrorStream extends DustNoopNoopGlobalNoopStream {
  override async *rawStreamOutputToEvents(): AsyncGenerator<ModelResponseEvent> {
    yield buildErrorEvent({
      errorSource: "provider",
      metadata: this.metadata(),
      type: "overloaded_error",
      message: "Provider overloaded before any output",
    });
  }
}

class PartialThenProviderErrorStream extends DustNoopNoopGlobalNoopStream {
  override async *rawStreamOutputToEvents(): AsyncGenerator<ModelResponseEvent> {
    const metadata = this.metadata();
    yield { type: "text_delta", content: { value: "partial" }, metadata };
    yield buildErrorEvent({
      errorSource: "provider",
      metadata,
      type: "server_error",
      message: "Provider failed after partial output",
    });
  }
}

class ToolOnlySuccessStream extends DustNoopNoopGlobalNoopStream {
  override async *rawStreamOutputToEvents(): AsyncGenerator<ModelResponseEvent> {
    const metadata = this.metadata();
    const toolCall = {
      type: "tool_call" as const,
      content: {
        id: "call_1",
        name: "search",
        arguments: { query: "dust" },
      },
      metadata,
    };
    yield toolCall;
    yield {
      type: "token_usage",
      content: {
        longCacheCreated: 0,
        shortCacheCreated: 0,
        cacheCreated: 0,
        cacheHit: 0,
        standardInput: 10,
        totalOutput: 5,
      },
      metadata,
    };
    yield {
      type: "success",
      content: { aggregated: [toolCall] },
      metadata,
    };
  }
}

function makeTraceContext(
  auth: Awaited<ReturnType<typeof createResourceTest>>["authenticator"]
): LLMTraceContext {
  return {
    operationType: "agent_conversation",
    conversationId: generateRandomModelSId(),
    userMessageOrigin: "web",
    workspaceId: auth.getNonNullableWorkspace().sId,
  };
}

function spyTelemetry() {
  const increment = vi
    .spyOn(statsDMetrics, "increment")
    .mockImplementation(() => {});
  const distribution = vi
    .spyOn(statsDMetrics, "distribution")
    .mockImplementation(() => {});
  const error = vi.spyOn(logger, "error").mockImplementation(() => {});
  const info = vi.spyOn(logger, "info").mockImplementation(() => {});
  const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
  return { increment, distribution, error, info, warn };
}

function callsNamed(
  spy: { mock: { calls: unknown[][] } },
  name: string
): unknown[][] {
  return spy.mock.calls.filter((call) => call[0] === name);
}

function tagsOf(call: unknown[]): string[] {
  const tags = call[call.length - 1];
  if (!Array.isArray(tags)) {
    throw new Error("Expected the last argument to be a tag array");
  }
  return tags;
}

async function consumeStream(
  llm: ReturnType<typeof makeNoopLLM>
): Promise<void> {
  for await (const _event of llm.stream(makeStreamParameters())) {
    // Consume the stream fully so it reaches a terminal event.
  }
}

class TokenUsageNoopStream extends DustNoopNoopGlobalNoopStream {
  override async *rawStreamOutputToEvents(
    raw: AsyncGenerator<string>
  ): AsyncGenerator<ModelResponseEvent> {
    for await (const event of super.rawStreamOutputToEvents(raw)) {
      if (event.type === "success") {
        yield {
          type: "token_usage",
          content: {
            longCacheCreated: 0,
            shortCacheCreated: 0,
            cacheCreated: 0,
            cacheHit: 10,
            standardInput: 90,
            totalOutput: 25,
          },
          metadata: event.metadata,
        };
      }
      yield event;
    }
  }
}

function makeStreamParameters(content = "hello"): LLMStreamParameters {
  return {
    conversation: {
      messages: [
        {
          role: "user",
          name: "user",
          content: [{ type: "text", text: content }],
        },
      ],
    },
    prompt: "",
    specifications: [],
  };
}

function makeNoopLLM(
  auth: Awaited<ReturnType<typeof createResourceTest>>["authenticator"],
  endpoint: typeof DustNoopNoopGlobalNoopStream = DustNoopNoopGlobalNoopStream,
  context?: LLMTraceContext
) {
  const llm = getStreamLLM(auth, {
    credentials: {},
    context,
    modelInfo: { endpoint, temperature: 0 },
  });
  if (!llm) {
    throw new Error("Expected the noop LLM to be available");
  }
  return llm;
}

function stubBatchResults(
  llm: ReturnType<typeof makeNoopLLM>,
  results: BatchResult
) {
  Object.assign(llm, {
    internalGetBatchResult: async () => results,
  });
}

function makeLifecycleParameters(): Parameters<
  typeof LLMRunLifecycle.start
>[1] {
  return {
    dustRunId: createLLMTraceId(generateRandomModelSId()),
    inferenceProvider: "openai-responses",
    inferenceRegion: "global" as const,
    modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
    providerId: GPT_5_MINI_MODEL_CONFIG.providerId,
    region: "us" as const,
    usageType: USAGE_TYPE_USER,
  };
}

describe("LLMRunLifecycle", () => {
  it("atomically creates a run and a pending usage attempt", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const parameters = makeLifecycleParameters();

    const lifecycle = await LLMRunLifecycle.start(auth, parameters);

    const run = await RunResource.fetchByDustRunId(auth, {
      dustRunId: parameters.dustRunId,
    });
    if (!run) {
      throw new Error("Expected the LLM run to exist");
    }
    expect(await run.listRunUsages(auth)).toEqual([]);
    expect(await run.listRunUsageAttempts(auth)).toMatchObject([
      {
        promptTokens: 0,
        completionTokens: 0,
        inferenceProvider: "openai-responses",
        isBatch: false,
        region: "us",
        usageState: "pending",
        usageType: USAGE_TYPE_USER,
      },
    ]);

    await lifecycle.close();
    expect(await run.listRunUsageAttempts(auth)).toMatchObject([
      { usageState: "unavailable" },
    ]);
  });

  it("finalizes the pending attempt when the provider reports usage", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const parameters = makeLifecycleParameters();
    const lifecycle = await LLMRunLifecycle.start(auth, parameters);

    await lifecycle.recordTokenUsage({
      inputTokens: 120,
      totalOutputTokens: 30,
      totalTokens: 150,
    });
    await lifecycle.close();

    const run = await RunResource.fetchByDustRunId(auth, {
      dustRunId: parameters.dustRunId,
    });
    if (!run) {
      throw new Error("Expected the LLM run to exist");
    }
    expect(await run.listRunUsageAttempts(auth)).toMatchObject([
      {
        promptTokens: 120,
        completionTokens: 30,
        usageState: "reported",
        usageType: USAGE_TYPE_USER,
      },
    ]);
    expect(await run.listRunUsages(auth)).toHaveLength(1);
  });

  it("persists fractional micro-dollar token costs as integers", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const parameters = {
      ...makeLifecycleParameters(),
      modelId: GPT_5_6_LUNA_MODEL_CONFIG.modelId,
      providerId: GPT_5_6_LUNA_MODEL_CONFIG.providerId,
    };
    const lifecycle = await LLMRunLifecycle.start(auth, parameters);

    await lifecycle.recordTokenUsage({
      inputTokens: 13_331,
      totalOutputTokens: 36,
      reasoningTokens: 22,
      totalTokens: 13_367,
      cachedTokens: 13_328,
      cacheCreationTokens: 0,
    });

    const run = await RunResource.fetchByDustRunId(auth, {
      dustRunId: parameters.dustRunId,
    });
    expect(await run?.listRunUsages(auth)).toMatchObject([
      { costMicroUsd: 310 },
    ]);
  });
});

describe("endpoint billing metadata", () => {
  it("uses EU pricing for EU stream and batch endpoints", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const credentials = { OPENAI_API_KEY: "test" };

    const streamLlm = getStreamLLM(auth, {
      credentials,
      modelInfo: {
        endpoint: DustOpenAIGptFiveDotFiveEuropeOpenAIResponsesStream,
        temperature: 0,
      },
    });
    if (!streamLlm) {
      throw new Error("Expected the EU stream LLM to be available");
    }

    const batchLlm = await getBatchLLM(auth, {
      credentials,
      modelInfo: {
        endpoint: DustOpenAIGptFiveDotFiveEuropeOpenAIResponsesBatch,
        temperature: 0,
      },
    });
    if (!batchLlm) {
      throw new Error("Expected the EU batch LLM to be available");
    }

    expect(streamLlm.getMetadata()).toMatchObject({
      inferenceProvider: "openai-responses",
      inferenceRegion: "eu",
      region: "eu",
    });
    expect(batchLlm.getMetadata()).toMatchObject({
      inferenceProvider: "openai-responses",
      inferenceRegion: "eu",
      region: "eu",
    });
  });

  it("keeps global endpoints on global pricing", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const llm = getStreamLLM(auth, {
      credentials: { OPENAI_API_KEY: "test" },
      modelInfo: {
        endpoint: DustOpenAIGptFiveDotFiveGlobalOpenAIResponsesStream,
        temperature: 0,
      },
    });
    if (!llm) {
      throw new Error("Expected the global stream LLM to be available");
    }

    expect(llm.getMetadata()).toMatchObject({
      inferenceRegion: "global",
      region: "global",
    });
  });
});

describe("non-batch LLM run persistence", () => {
  it("signals a successful stream that reports no usage", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const increment = vi
      .spyOn(statsDMetrics, "increment")
      .mockImplementation(() => {});
    const llm = makeNoopLLM(auth, DustNoopNoopGlobalNoopStream, {
      operationType: "agent_conversation",
      conversationId: generateRandomModelSId(),
      userMessageOrigin: "web",
      workspaceId: auth.getNonNullableWorkspace().sId,
    });

    for await (const _event of llm.stream(makeStreamParameters())) {
      // Consume the stream fully so it reaches its terminal success event.
    }

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        llmEventType: "success_without_usage",
        traceId: llm.getTraceId(),
      }),
      "LLM Success without usage"
    );
    expect(increment).toHaveBeenCalledWith(
      "llm_success_without_usage.count",
      1,
      expect.any(Array)
    );
  });

  it.each([
    { origin: "web" as const, usageType: USAGE_TYPE_USER },
    { origin: "api" as const, usageType: USAGE_TYPE_PROGRAMMATIC },
  ])("classifies $origin agent usage as $usageType when creating the run", async ({
    origin,
    usageType,
  }) => {
    const { authenticator: auth } = await createResourceTest({});
    const llm = makeNoopLLM(auth, DustNoopNoopGlobalNoopStream, {
      operationType: "agent_conversation",
      userMessageOrigin: origin,
    });

    for await (const _event of llm.stream(
      makeStreamParameters("consume $1.25")
    )) {
      // Consume the stream fully so the noop request completes.
    }

    const run = await RunResource.fetchByDustRunId(auth, {
      dustRunId: llm.getTraceId(),
    });
    expect(await run?.listRunUsageAttempts(auth)).toMatchObject([
      { usageState: "reported", usageType },
    ]);
  });

  it("finalizes usage from the provider stream", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const llm = makeNoopLLM(auth, TokenUsageNoopStream);

    for await (const _event of llm.stream(makeStreamParameters())) {
      // Consume the stream fully so the provider reports usage.
    }

    const run = await RunResource.fetchByDustRunId(auth, {
      dustRunId: llm.getTraceId(),
    });
    if (!run) {
      throw new Error("Expected a run for the successful provider call");
    }
    expect(await run.listRunUsageAttempts(auth)).toMatchObject([
      {
        promptTokens: 100,
        completionTokens: 25,
        inferenceProvider: "noop",
        isBatch: false,
        region: "global",
        usageState: "reported",
      },
    ]);
  });

  it("records simulated usage without a tracing context", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const llm = makeNoopLLM(auth);

    for await (const _event of llm.stream(
      makeStreamParameters("consume $1.25")
    )) {
      // Consume the stream fully so the noop request completes.
    }

    const run = await RunResource.fetchByDustRunId(auth, {
      dustRunId: llm.getTraceId(),
    });
    if (!run) {
      throw new Error("Expected a run for the successful provider call");
    }
    expect(await run.listRunUsageAttempts(auth)).toMatchObject([
      {
        costMicroUsd: 1_250_000,
        isBatch: false,
        usageState: "reported",
        usageType: USAGE_TYPE_FREE,
      },
    ]);
  });

  it("preserves an unavailable attempt when the provider fails", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const llm = makeNoopLLM(auth, ThrowingNoopStream);

    const events = [];
    for await (const event of llm.stream(makeStreamParameters())) {
      events.push(event);
    }
    expect(events.at(-1)?.type).toBe("error");

    const run = await RunResource.fetchByDustRunId(auth, {
      dustRunId: llm.getTraceId(),
    });
    if (!run) {
      throw new Error("Expected a run for the failed provider call");
    }
    expect(await run.listRunUsageAttempts(auth)).toMatchObject([
      { isBatch: false, usageState: "unavailable" },
    ]);
    expect(await run.listRunUsages(auth)).toEqual([]);
  });

  it("closes the pending attempt when the stream consumer cancels", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const llm = makeNoopLLM(auth);
    const stream = llm.stream(makeStreamParameters());

    expect((await stream.next()).done).toBe(false);
    await stream.return(undefined);

    const run = await RunResource.fetchByDustRunId(auth, {
      dustRunId: llm.getTraceId(),
    });
    if (!run) {
      throw new Error("Expected a run for the cancelled provider call");
    }
    expect(await run.listRunUsageAttempts(auth)).toMatchObject([
      { isBatch: false, usageState: "unavailable" },
    ]);
  });
});

describe("LLM stream telemetry", () => {
  const streamBaseTags = [
    "model_id:noop",
    "provider_id:noop",
    "client_id:noop",
    "inference_provider:noop",
    "region:global",
    "operation_type:agent_conversation",
    "surface:stream",
  ];

  function expectStreamBaseTags(tags: string[]) {
    expect(tags).toEqual(expect.arrayContaining(streamBaseTags));
  }

  function expectAllLlmMetricsCarryBaseTags(
    increment: ReturnType<typeof spyTelemetry>["increment"],
    distribution: ReturnType<typeof spyTelemetry>["distribution"]
  ) {
    const llmCalls = [
      ...increment.mock.calls,
      ...distribution.mock.calls,
    ].filter((call) => String(call[0]).startsWith("llm_"));

    expect(llmCalls.length).toBeGreaterThan(0);
    for (const call of llmCalls) {
      expectStreamBaseTags(tagsOf(call));
    }
  }

  it("emits one interaction, one success, and one duration on a successful stream", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const { increment, distribution, info } = spyTelemetry();
    const llm = makeNoopLLM(auth, TokenUsageNoopStream, makeTraceContext(auth));

    await consumeStream(llm);

    expect(callsNamed(increment, "llm_interaction.count")).toHaveLength(1);
    expect(callsNamed(increment, "llm_success.count")).toHaveLength(1);
    expect(callsNamed(increment, "llm_error.count")).toHaveLength(0);
    expect(
      callsNamed(increment, "llm_success_without_usage.count")
    ).toHaveLength(0);
    expect(callsNamed(distribution, "llm_duration_ms")).toHaveLength(1);
    expect(callsNamed(distribution, "llm_time_to_first_event_ms")).toHaveLength(
      1
    );
    expect(callsNamed(distribution, "llm_time_to_first_token_ms")).toHaveLength(
      1
    );

    const interactionTags = tagsOf(
      callsNamed(increment, "llm_interaction.count")[0]
    );
    expectStreamBaseTags(interactionTags);
    expect(interactionTags).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^requested_reasoning_effort:/),
      ])
    );
    expect(interactionTags).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^error_/)])
    );

    const durationTags = tagsOf(callsNamed(distribution, "llm_duration_ms")[0]);
    expect(durationTags).toEqual(
      expect.arrayContaining([
        "outcome:success",
        "requested_reasoning_effort:none",
      ])
    );

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        llmEventType: "success",
        surface: "stream",
        durationMs: expect.any(Number),
        timeToFirstEventMs: expect.any(Number),
        timeToFirstTokenMs: expect.any(Number),
        requestedReasoningEffort: "none",
      }),
      "LLM Success"
    );
    expectAllLlmMetricsCarryBaseTags(increment, distribution);
  });

  it("emits a provider error and no TTFT when the provider fails before output", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const { increment, distribution, error } = spyTelemetry();
    const llm = makeNoopLLM(
      auth,
      ImmediateProviderErrorStream,
      makeTraceContext(auth)
    );

    await consumeStream(llm);

    expect(callsNamed(increment, "llm_interaction.count")).toHaveLength(1);
    expect(callsNamed(increment, "llm_success.count")).toHaveLength(0);
    const errorCalls = callsNamed(increment, "llm_error.count");
    expect(errorCalls).toHaveLength(1);
    expect(tagsOf(errorCalls[0])).toEqual(
      expect.arrayContaining([
        "error_type:overloaded_error",
        "error_source:provider",
      ])
    );
    expect(callsNamed(distribution, "llm_duration_ms")).toHaveLength(1);
    expect(tagsOf(callsNamed(distribution, "llm_duration_ms")[0])).toEqual(
      expect.arrayContaining([
        "outcome:error",
        "error_type:overloaded_error",
        "error_source:provider",
      ])
    );
    expect(callsNamed(distribution, "llm_time_to_first_event_ms")).toHaveLength(
      1
    );
    expect(callsNamed(distribution, "llm_time_to_first_token_ms")).toHaveLength(
      0
    );
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        llmEventType: "error",
        errorType: "overloaded_error",
        errorSource: "provider",
        surface: "stream",
        durationMs: expect.any(Number),
      }),
      "LLM Error"
    );
    const errorPayload = error.mock.calls.find(
      ([, message]) => message === "LLM Error"
    )?.[0];
    expect(errorPayload).not.toHaveProperty("timeToFirstTokenMs");
    expectAllLlmMetricsCarryBaseTags(increment, distribution);
  });

  it("preserves a provider source when the request throws before any stream event", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const { increment, distribution } = spyTelemetry();
    const llm = makeNoopLLM(auth, ThrowingNoopStream, makeTraceContext(auth));

    await consumeStream(llm);

    expect(callsNamed(increment, "llm_interaction.count")).toHaveLength(1);
    expect(callsNamed(increment, "llm_success.count")).toHaveLength(0);
    const errorCalls = callsNamed(increment, "llm_error.count");
    expect(errorCalls).toHaveLength(1);
    expect(tagsOf(errorCalls[0])).toEqual(
      expect.arrayContaining([
        "error_type:overloaded_error",
        "error_source:provider",
      ])
    );
    expect(callsNamed(distribution, "llm_duration_ms")).toHaveLength(1);
    expect(callsNamed(distribution, "llm_time_to_first_event_ms")).toHaveLength(
      1
    );
    expect(callsNamed(distribution, "llm_time_to_first_token_ms")).toHaveLength(
      0
    );
  });

  it("emits a provider error with duration and TTFT after partial output", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const { increment, distribution, error } = spyTelemetry();
    const llm = makeNoopLLM(
      auth,
      PartialThenProviderErrorStream,
      makeTraceContext(auth)
    );

    await consumeStream(llm);

    expect(callsNamed(increment, "llm_interaction.count")).toHaveLength(1);
    expect(callsNamed(increment, "llm_error.count")).toHaveLength(1);
    expect(tagsOf(callsNamed(increment, "llm_error.count")[0])).toEqual(
      expect.arrayContaining([
        "error_type:server_error",
        "error_source:provider",
      ])
    );
    expect(callsNamed(distribution, "llm_duration_ms")).toHaveLength(1);
    expect(callsNamed(distribution, "llm_time_to_first_token_ms")).toHaveLength(
      1
    );
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        errorType: "server_error",
        errorSource: "provider",
        durationMs: expect.any(Number),
        timeToFirstTokenMs: expect.any(Number),
      }),
      "LLM Error"
    );
  });

  it("emits an unknown stream_error when the stream ends without a terminal event", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const { increment, error } = spyTelemetry();
    const llm = makeNoopLLM(auth, IncompleteNoopStream, makeTraceContext(auth));

    await consumeStream(llm);

    expect(callsNamed(increment, "llm_interaction.count")).toHaveLength(1);
    expect(tagsOf(callsNamed(increment, "llm_error.count")[0])).toEqual(
      expect.arrayContaining([
        "error_type:stream_error",
        "error_source:unknown",
      ])
    );
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        errorType: "stream_error",
        errorSource: "unknown",
      }),
      "LLM Error"
    );
  });

  it("preserves success-without-usage warning behavior without duplicate duration metrics", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const { increment, distribution, warn } = spyTelemetry();
    const llm = makeNoopLLM(
      auth,
      DustNoopNoopGlobalNoopStream,
      makeTraceContext(auth)
    );

    await consumeStream(llm);

    expect(callsNamed(increment, "llm_interaction.count")).toHaveLength(1);
    expect(callsNamed(increment, "llm_success.count")).toHaveLength(1);
    expect(
      callsNamed(increment, "llm_success_without_usage.count")
    ).toHaveLength(1);
    expect(callsNamed(distribution, "llm_duration_ms")).toHaveLength(1);
    expect(tagsOf(callsNamed(distribution, "llm_duration_ms")[0])).toEqual(
      expect.arrayContaining(["outcome:success_without_usage"])
    );
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        llmEventType: "success_without_usage",
        surface: "stream",
        durationMs: expect.any(Number),
      }),
      "LLM Success without usage"
    );
  });

  it("does not emit TTFT for a tool-only success", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const { increment, distribution, info } = spyTelemetry();
    const llm = makeNoopLLM(
      auth,
      ToolOnlySuccessStream,
      makeTraceContext(auth)
    );

    await consumeStream(llm);

    expect(callsNamed(increment, "llm_success.count")).toHaveLength(1);
    expect(callsNamed(distribution, "llm_time_to_first_event_ms")).toHaveLength(
      1
    );
    expect(callsNamed(distribution, "llm_time_to_first_token_ms")).toHaveLength(
      0
    );
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        llmEventType: "success",
        timeToFirstEventMs: expect.any(Number),
      }),
      "LLM Success"
    );
    const successPayload = info.mock.calls.find(
      ([, message]) => message === "LLM Success"
    )?.[0];
    expect(successPayload).not.toHaveProperty("timeToFirstTokenMs");
  });

  it("does not emit a false provider error when the consumer cancels", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const { increment, distribution } = spyTelemetry();
    const llm = makeNoopLLM(
      auth,
      DustNoopNoopGlobalNoopStream,
      makeTraceContext(auth)
    );
    const stream = llm.stream(makeStreamParameters());

    expect((await stream.next()).done).toBe(false);
    await stream.return(undefined);

    expect(callsNamed(increment, "llm_interaction.count")).toHaveLength(1);
    expect(callsNamed(increment, "llm_error.count")).toHaveLength(0);
    expect(callsNamed(increment, "llm_success.count")).toHaveLength(0);
    expect(callsNamed(distribution, "llm_duration_ms")).toHaveLength(0);
  });

  it("does not emit attempt metrics without a tracing context", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const { increment, distribution } = spyTelemetry();
    const llm = makeNoopLLM(auth, TokenUsageNoopStream);

    await consumeStream(llm);

    expect(callsNamed(increment, "llm_interaction.count")).toHaveLength(0);
    expect(callsNamed(increment, "llm_success.count")).toHaveLength(0);
    expect(callsNamed(increment, "llm_error.count")).toHaveLength(0);
    expect(callsNamed(distribution, "llm_duration_ms")).toHaveLength(0);
  });
});

describe("LLM batch telemetry", () => {
  const batchBaseTags = [
    "model_id:noop",
    "provider_id:noop",
    "client_id:noop",
    "inference_provider:noop",
    "region:global",
    "operation_type:agent_conversation",
    "surface:batch",
  ];

  it("emits one interaction and one success without duration", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const { increment, distribution } = spyTelemetry();
    const llm = makeNoopLLM(
      auth,
      DustNoopNoopGlobalNoopStream,
      makeTraceContext(auth)
    );
    stubBatchResults(
      llm,
      new Map([
        [
          "c1",
          [
            {
              type: "success",
              aggregated: [],
              metadata: llm.getMetadata(),
            },
          ],
        ],
      ])
    );

    await llm.getBatchResult("batch-1");

    expect(callsNamed(increment, "llm_interaction.count")).toHaveLength(1);
    expect(tagsOf(callsNamed(increment, "llm_interaction.count")[0])).toEqual(
      expect.arrayContaining(batchBaseTags)
    );
    expect(callsNamed(increment, "llm_success.count")).toHaveLength(1);
    expect(callsNamed(increment, "llm_error.count")).toHaveLength(0);
    expect(callsNamed(distribution, "llm_duration_ms")).toHaveLength(0);
    expect(callsNamed(distribution, "llm_time_to_first_event_ms")).toHaveLength(
      0
    );
  });

  it("emits a provider error with identity tags and no duration", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const { increment, distribution, error } = spyTelemetry();
    const llm = makeNoopLLM(
      auth,
      DustNoopNoopGlobalNoopStream,
      makeTraceContext(auth)
    );
    stubBatchResults(
      llm,
      new Map([
        [
          "c1",
          [
            new EventError(
              {
                type: "overloaded_error",
                message: "batch overloaded",
                isRetryable: true,
                errorSource: "provider",
              },
              llm.getMetadata()
            ),
          ],
        ],
      ])
    );

    await llm.getBatchResult("batch-1");

    expect(callsNamed(increment, "llm_interaction.count")).toHaveLength(1);
    expect(tagsOf(callsNamed(increment, "llm_error.count")[0])).toEqual(
      expect.arrayContaining([
        ...batchBaseTags,
        "error_type:overloaded_error",
        "error_source:provider",
      ])
    );
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        llmEventType: "error",
        errorType: "overloaded_error",
        errorSource: "provider",
        surface: "batch",
      }),
      "LLM Error"
    );
    expect(callsNamed(distribution, "llm_duration_ms")).toHaveLength(0);
  });
});
