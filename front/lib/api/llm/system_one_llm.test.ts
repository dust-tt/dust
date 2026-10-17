import assert from "node:assert";
import { SystemOneLLM } from "@app/lib/api/llm/system_one_llm";
import type { Authenticator } from "@app/lib/auth";
import type { DustSystemOneEndpointConstructor } from "@app/lib/llms/system_one/dust_system_one_endpoint";
import { DustOpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne } from "@app/lib/llms/system_one/endpoints/openai_gpt_six_luna_global_openai_decisions";
import { USAGE_TYPE_FREE, USAGE_TYPE_USER } from "@app/lib/metronome/constants";
import type { DecisionRequest } from "@app/lib/model_constructors/types/input/decisions";
import type { DecisionResult } from "@app/lib/model_constructors/types/output/decisions";
import type { ErrorEvent } from "@app/lib/model_constructors/types/output/events";
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import { RunResource } from "@app/lib/resources/run_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { describe, expect, it } from "vitest";

const request: DecisionRequest = {
  input: "What is 2 + 2?",
  questions: [
    { type: "predicate", name: "is_arithmetic", instructions: "Arithmetic?" },
  ],
};

class AnsweringEndpoint extends DustOpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne {
  override async decide(): Promise<Result<DecisionResult, ErrorEvent>> {
    return new Ok({
      answers: [{ type: "predicate", name: "is_arithmetic", probability: 1 }],
      usage: {
        standardInput: 100_000,
        cacheHit: 0,
        cacheCreated: 0,
        longCacheCreated: 0,
        shortCacheCreated: 0,
        totalOutput: 0,
      },
    });
  }
}

class FailingEndpoint extends DustOpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne {
  override async decide(): Promise<Result<DecisionResult, ErrorEvent>> {
    return new Err(
      buildErrorEvent({
        errorSource: "provider",
        metadata: this.metadata(),
        type: "timeout_error",
        message: "Decision timed out",
      })
    );
  }
}

function makeLLM(
  auth: Authenticator,
  endpoint: DustSystemOneEndpointConstructor,
  userMessageOrigin: UserMessageOrigin = "web"
) {
  return new SystemOneLLM(auth, {
    credentials: {},
    endpoint,
    context: { operationType: "auto_tier_routing", userMessageOrigin },
  });
}

describe("SystemOneLLM", () => {
  it("records the decision as a priced, reported run usage", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const llm = makeLLM(auth, AnsweringEndpoint);

    const result = await llm.decide(request);

    assert(result.isOk(), "expected the decision to succeed");
    const run = await RunResource.fetchByDustRunId(auth, {
      dustRunId: llm.getTraceId(),
    });
    assert(run, "expected a run for the decision");
    expect(await run.listRunUsageAttempts(auth)).toMatchObject([
      {
        usageState: "reported",
        modelId: "gpt-6-luna",
        promptTokens: 100_000,
        completionTokens: 0,
        costMicroUsd: 10_000,
      },
    ]);
  });

  it("marks the usage unavailable when the decision fails", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const llm = makeLLM(auth, FailingEndpoint);

    const result = await llm.decide(request);

    assert(result.isErr(), "expected the decision to fail");
    const run = await RunResource.fetchByDustRunId(auth, {
      dustRunId: llm.getTraceId(),
    });
    assert(run, "expected a run for the decision");
    expect(await run.listRunUsageAttempts(auth)).toMatchObject([
      { usageState: "unavailable" },
    ]);
  });

  it.each([
    { origin: "web" as const, usageType: USAGE_TYPE_USER },
    { origin: "agent_sidekick" as const, usageType: USAGE_TYPE_FREE },
  ])(
    "bills a routing decision for a $origin message as $usageType",
    async ({ origin, usageType }) => {
      const { authenticator: auth } = await createResourceTest({});
      const llm = makeLLM(auth, AnsweringEndpoint, origin);

      await llm.decide(request);

      const run = await RunResource.fetchByDustRunId(auth, {
        dustRunId: llm.getTraceId(),
      });
      assert(run, "expected a run for the decision");
      expect(await run.listRunUsageAttempts(auth)).toMatchObject([
        { usageType },
      ]);
    }
  );
});
