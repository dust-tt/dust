import { getStreamLLM } from "@app/lib/api/llm";
import { LLMRunLifecycle } from "@app/lib/api/llm/run_lifecycle";
import { createLLMTraceId } from "@app/lib/api/llm/traces/buffer";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import { DustNoopNoopGlobalNoopStream } from "@app/lib/llms/stream/endpoints/noop_noop_global_noop";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { RunResource } from "@app/lib/resources/run_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GPT_5_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import { describe, expect, it } from "vitest";

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
  endpoint: typeof DustNoopNoopGlobalNoopStream = DustNoopNoopGlobalNoopStream
) {
  const llm = getStreamLLM(auth, {
    credentials: {},
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
});

describe("non-batch LLM run persistence", () => {
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
