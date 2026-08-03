import { RunResource } from "@app/lib/resources/run_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
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
      GPT_5_MINI_MODEL_CONFIG.modelId
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
      GPT_5_MINI_MODEL_CONFIG.modelId
    );

    const usages = await run.listRunUsages(auth);

    expect(usages[0]?.reasoningTokens).toBeNull();
  });
});

describe("RunResource.setUsageTypeForRuns", () => {
  it("stamps the usage type on the run's usage rows", async () => {
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
      GPT_5_MINI_MODEL_CONFIG.modelId
    );

    await RunResource.setUsageTypeForRuns(auth, {
      runs: [run],
      usageType: "free",
    });

    const usages = await RunResource.listRunUsagesForRuns(auth, {
      runs: [run],
    });

    expect(usages).toHaveLength(1);
    expect(usages[0]?.usageType).toBe("free");
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
