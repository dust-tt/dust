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
