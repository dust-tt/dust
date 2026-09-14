import { computeTokensCostForUsageInMicroUsd } from "@app/lib/api/assistant/token_pricing";
import { USAGE_TYPE_FREE, USAGE_TYPE_USER } from "@app/lib/metronome/constants";
import { RunResource } from "@app/lib/resources/run_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RunFactory } from "@app/tests/utils/RunFactory";
import { GPT_5_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import { describe, expect, it } from "vitest";

describe("RunResource reasoning token usage", () => {
  it("persists provider-reported reasoning as a subset of completion tokens", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const run = await RunResource.makeNew({
      appId: null,
      dustRunId: generateRandomModelSId(),
      runType: "deploy",
      useWorkspaceCredentials: false,
      workspaceId: workspace.id,
    });

    await run.recordTokenUsage(
      auth,
      {
        inputTokens: 1_000,
        totalOutputTokens: 300,
        reasoningTokens: 200,
        totalTokens: 1_300,
      },
      GPT_5_MINI_MODEL_CONFIG.modelId,
      { usageType: USAGE_TYPE_USER }
    );

    const usages = await run.listRunUsages(auth);

    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({
      completionTokens: 300,
      reasoningTokens: 200,
    });
  });

  it("stores null when the provider does not report reasoning tokens", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const run = await RunResource.makeNew({
      appId: null,
      dustRunId: generateRandomModelSId(),
      runType: "deploy",
      useWorkspaceCredentials: false,
      workspaceId: workspace.id,
    });

    await run.recordTokenUsage(
      auth,
      {
        inputTokens: 1_000,
        totalOutputTokens: 100,
        totalTokens: 1_100,
      },
      GPT_5_MINI_MODEL_CONFIG.modelId,
      { usageType: USAGE_TYPE_USER }
    );

    const usages = await run.listRunUsages(auth);

    expect(usages[0]?.reasoningTokens).toBeNull();
  });
});

describe("RunResource service tier usage", () => {
  it("persists the provider-reported tier that priced the tokens", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const { run, runUsageModelId } = await RunResource.makeNewWithPendingUsage(
      {
        appId: null,
        dustRunId: generateRandomModelSId(),
        runType: "deploy",
        useWorkspaceCredentials: false,
        workspaceId: workspace.id,
      },
      {
        inferenceProvider: "openai-responses",
        modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
        providerId: GPT_5_MINI_MODEL_CONFIG.providerId,
        region: "global",
        usageType: USAGE_TYPE_USER,
      }
    );

    // The pending attempt predates the provider response, so it carries the
    // standard tier until the response says otherwise.
    expect(await run.listRunUsageAttempts(auth)).toMatchObject([
      { serviceTier: "default", usageState: "pending" },
    ]);

    const costMicroUsd = await run.finalizePendingTokenUsage(
      auth,
      runUsageModelId,
      {
        inputTokens: 1_000,
        totalOutputTokens: 300,
        totalTokens: 1_300,
        serviceTier: "flex",
      },
      GPT_5_MINI_MODEL_CONFIG.modelId
    );

    const usages = await run.listRunUsages(auth);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({ serviceTier: "flex" });

    // The persisted tier is the one the cost was computed with.
    expect(usages[0]?.costMicroUsd).toBe(costMicroUsd);
    expect(costMicroUsd).toBe(
      Math.round(
        computeTokensCostForUsageInMicroUsd({
          modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
          promptTokens: 1_000,
          completionTokens: 300,
          cachedTokens: null,
          serviceTier: "flex",
        })
      )
    );
  });

  it("falls back to the standard tier when the provider reports none", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const run = await RunResource.makeNew({
      appId: null,
      dustRunId: generateRandomModelSId(),
      runType: "deploy",
      useWorkspaceCredentials: false,
      workspaceId: workspace.id,
    });

    await run.recordTokenUsage(
      auth,
      {
        inputTokens: 1_000,
        totalOutputTokens: 100,
        totalTokens: 1_100,
      },
      GPT_5_MINI_MODEL_CONFIG.modelId,
      { usageType: USAGE_TYPE_USER }
    );

    const usages = await run.listRunUsages(auth);
    expect(usages[0]?.serviceTier).toBe("default");
  });
});

describe("RunResource.setUsageTypeForRunsIfMissing", () => {
  it("classifies legacy rows without overriding existing classifications", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const { run: legacyRun } = await RunFactory.createWithUsage(auth, {
      usageType: null,
    });
    const { run: classifiedRun } = await RunFactory.createWithUsage(auth, {
      usageType: USAGE_TYPE_USER,
    });

    await RunResource.setUsageTypeForRunsIfMissing(auth, {
      runs: [legacyRun, classifiedRun],
      usageType: USAGE_TYPE_FREE,
    });

    const usages = await RunResource.listRunUsagesForRuns(auth, {
      runs: [legacyRun, classifiedRun],
    });

    expect(
      new Map(usages.map((usage) => [usage.runModelId, usage.usageType]))
    ).toEqual(
      new Map([
        [legacyRun.id, USAGE_TYPE_FREE],
        [classifiedRun.id, USAGE_TYPE_USER],
      ])
    );
  });
});

describe("RunResource usage type immutability", () => {
  it("preserves the creation-time classification when finalizing", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const { run, runUsageModelId } = await RunResource.makeNewWithPendingUsage(
      {
        appId: null,
        dustRunId: generateRandomModelSId(),
        runType: "deploy",
        useWorkspaceCredentials: false,
        workspaceId: workspace.id,
      },
      {
        inferenceProvider: "openai-responses",
        modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
        providerId: GPT_5_MINI_MODEL_CONFIG.providerId,
        region: "global",
        usageType: USAGE_TYPE_USER,
      }
    );

    await run.finalizePendingRunUsage(auth, runUsageModelId, [
      {
        cachedTokens: null,
        completionTokens: 30,
        costMicroUsd: 10,
        isBatch: false,
        modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
        promptTokens: 120,
        providerId: GPT_5_MINI_MODEL_CONFIG.providerId,
        reasoningTokens: null,
      },
    ]);

    expect(await run.listRunUsageAttempts(auth)).toMatchObject([
      { usageState: "reported", usageType: USAGE_TYPE_USER },
    ]);
  });
});

describe("RunResource.setRunKeyForDustRunIds", () => {
  it("tags untagged runs, skips already-tagged rows, and overwrites a different key", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const dustRunId = generateRandomModelSId();
    await RunResource.makeNew({
      appId: null,
      dustRunId,
      runType: "agent_loop",
      useWorkspaceCredentials: false,
      workspaceId: workspace.id,
    });

    await RunResource.setRunKeyForDustRunIds(auth, {
      dustRunIds: [dustRunId],
      runKey: "key-a",
    });
    const tagged = await RunResource.fetchByDustRunId(auth, { dustRunId });
    expect(tagged?.runKey).toBe("key-a");

    // Re-tagging with the same key must not rewrite the row. The sleep keeps
    // millisecond-precision updatedAt from masking a rewrite.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await RunResource.setRunKeyForDustRunIds(auth, {
      dustRunIds: [dustRunId],
      runKey: "key-a",
    });
    const retagged = await RunResource.fetchByDustRunId(auth, { dustRunId });
    expect(retagged?.updatedAt.getTime()).toBe(tagged?.updatedAt.getTime());

    await RunResource.setRunKeyForDustRunIds(auth, {
      dustRunIds: [dustRunId],
      runKey: "key-b",
    });
    const overwritten = await RunResource.fetchByDustRunId(auth, { dustRunId });
    expect(overwritten?.runKey).toBe("key-b");
  });
});
