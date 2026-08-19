import { getBatchLLM, getStreamLLM } from "@app/lib/api/llm";
import { LLMRunLifecycle } from "@app/lib/api/llm/run_lifecycle";
import { createLLMTraceId } from "@app/lib/api/llm/traces/buffer";
import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import { DustOpenAIGptFiveDotFiveEuropeOpenAIResponsesBatch } from "@app/lib/llms/batch/endpoints/openai_gpt_five_dot_five_eu_openai_responses";
import { DustNoopNoopGlobalNoopStream } from "@app/lib/llms/stream/endpoints/noop_noop_global_noop";
import { DustOpenAIGptFiveDotFiveEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_five_eu_openai_responses";
import { DustOpenAIGptFiveDotFiveGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_five_global_openai_responses";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import { RunResource } from "@app/lib/resources/run_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { getStatsDClient } from "@app/lib/utils/statsd";
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
    throw new Error("Provider failed before reporting usage");
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

class ErrorThenTokenUsageNoopStream extends DustNoopNoopGlobalNoopStream {
  override async *rawStreamOutputToEvents(
    raw: AsyncGenerator<string>
  ): AsyncGenerator<ModelResponseEvent> {
    for await (const event of super.rawStreamOutputToEvents(raw)) {
      if (event.type === "success") {
        yield buildErrorEvent({
          metadata: event.metadata,
          type: "stop_error",
          message: "The maximum response length was reached.",
        });
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

function makeLifecycleParameters() {
  return {
    dustRunId: createLLMTraceId(generateRandomModelSId()),
    inferenceProvider: "openai-responses",
    inferenceRegion: "global" as const,
    modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
    providerId: GPT_5_MINI_MODEL_CONFIG.providerId,
    region: "us" as const,
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
      .spyOn(getStatsDClient(), "increment")
      .mockImplementation(() => {});
    const llm = makeNoopLLM(auth, DustNoopNoopGlobalNoopStream, {
      operationType: "agent_conversation",
      conversationId: generateRandomModelSId(),
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

  it("logs whether a failed stream reported usage and partial output", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});
    const llm = makeNoopLLM(auth, ErrorThenTokenUsageNoopStream, {
      operationType: "agent_conversation",
      conversationId: generateRandomModelSId(),
      workspaceId: auth.getNonNullableWorkspace().sId,
    });

    for await (const _event of llm.stream(makeStreamParameters())) {
      // Consume the stream fully so the terminal error is traced.
    }

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        llmEventType: "error",
        traceId: llm.getTraceId(),
        hasUsage: true,
        hasPartialOutput: true,
      }),
      "LLM Error"
    );

    const run = await RunResource.fetchByDustRunId(auth, {
      dustRunId: llm.getTraceId(),
    });
    expect(await run?.listRunUsageAttempts(auth)).toMatchObject([
      { usageState: "reported" },
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
        usageType: "free",
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
