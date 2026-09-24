import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import baseLogger from "@app/logger/logger";
import {
  getMigratedReasoningEffort,
  migrateReasoningEfforts,
} from "@app/migrations/20260924_migrate_reasoning_effort_to_router_vocabulary";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { Authenticator } from "@app/lib/auth";
import type { LightWorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

describe("getMigratedReasoningEffort", () => {
  it.each([
    ["claude-sonnet-5", "none", "low"],
    ["claude-sonnet-5", "light", "low"],
    ["claude-sonnet-5", null, "medium"],
    ["claude-haiku-4-5-20251001", "light", "low"],
    ["claude-haiku-4-5-20251001", null, "low"],
    ["claude-haiku-4-5-20251001", "none", "none"],
    ["accounts/fireworks/models/kimi-k3", "medium", "high"],
    ["accounts/fireworks/models/kimi-k3", "high", "maximal"],
    ["accounts/fireworks/models/deepseek-v4-pro", "none", "high"],
    ["gemini-3.5-flash-lite", "none", "minimal"],
    ["gpt-5", "none", "low"],
    ["grok-4.5", "light", "low"],
  ] as const)("migrates %s at %s to %s", (modelId, storedEffort, expected) => {
    expect(getMigratedReasoningEffort(modelId, storedEffort)).toBe(expected);
  });

  it("keeps a supported effort that already ran as stored", () => {
    expect(getMigratedReasoningEffort("gpt-5.5", "medium")).toBe("medium");
  });

  it("only renames light on models the router does not serve", () => {
    expect(getMigratedReasoningEffort("claude-3-opus-20240229", "light")).toBe(
      "low"
    );
    expect(
      getMigratedReasoningEffort("claude-3-opus-20240229", "medium")
    ).toBeUndefined();
  });

  it("leaves efforts outside the legacy vocabulary alone", () => {
    expect(
      getMigratedReasoningEffort("accounts/fireworks/models/kimi-k3", "maximal")
    ).toBeUndefined();
  });
});

type StoredModel = { modelId: string; reasoningEffort: string };

async function createAgentOnModel(
  auth: Authenticator,
  workspace: LightWorkspaceType,
  { modelId, reasoningEffort }: StoredModel
): Promise<string> {
  const agent = await AgentConfigurationFactory.createTestAgent(auth, {
    name: `${modelId} at ${reasoningEffort}`,
  });
  await AgentConfigurationModel.update({ modelId, reasoningEffort } as never, {
    where: { workspaceId: workspace.id, sId: agent.sId },
  });
  return agent.sId;
}

async function storedEffortOf(
  workspace: LightWorkspaceType,
  sId: string
): Promise<string | null> {
  const [row] = await AgentConfigurationModel.findAll({
    attributes: ["reasoningEffort"],
    where: { workspaceId: workspace.id, sId },
    raw: true,
  });
  return row?.reasoningEffort ?? null;
}

describe("migrateReasoningEfforts", () => {
  it("rewrites agents created before the cutoff to the effort they ran at", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const beforeCutoff = await createAgentOnModel(authenticator, workspace, {
      modelId: "accounts/fireworks/models/kimi-k3",
      reasoningEffort: "medium",
    });
    const legacyLight = await createAgentOnModel(authenticator, workspace, {
      modelId: "claude-haiku-4-5-20251001",
      reasoningEffort: "light",
    });
    const cutoff = new Date();
    const afterCutoff = await createAgentOnModel(authenticator, workspace, {
      modelId: "accounts/fireworks/models/kimi-k3",
      reasoningEffort: "high",
    });

    await migrateReasoningEfforts({
      cutoff,
      execute: true,
      logger: baseLogger,
    });

    expect(await storedEffortOf(workspace, beforeCutoff)).toBe("high");
    expect(await storedEffortOf(workspace, legacyLight)).toBe("low");
    expect(await storedEffortOf(workspace, afterCutoff)).toBe("high");
  });

  it("writes nothing on a dry run", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await createAgentOnModel(authenticator, workspace, {
      modelId: "accounts/fireworks/models/kimi-k3",
      reasoningEffort: "medium",
    });

    await migrateReasoningEfforts({
      cutoff: new Date(),
      execute: false,
      logger: baseLogger,
    });

    expect(await storedEffortOf(workspace, agent)).toBe("medium");
  });
});
