import { AgentModel } from "@app/lib/models/agent/agent";
import { backfillAgentHeadFields } from "@app/migrations/20260915_backfill_agent_head_fields";
import baseLogger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import assert from "assert";
import { describe, expect, it } from "vitest";

const logger = baseLogger.child({}, { level: "silent" });

describe("backfillAgentHeadFields", () => {
  it("copies the current configuration's head fields onto stale agents, idempotently", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const staleAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Stale head", scope: "visible" }
    );
    const freshAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Fresh head", scope: "hidden" }
    );

    // Simulate an identity whose head predates the mirrored columns' writers.
    await AgentModel.update(
      {
        name: "Renamed since",
        status: "archived",
        scope: "hidden",
        reinforcement: "off",
      },
      { where: { sId: staleAgent.sId, workspaceId: workspace.id } }
    );

    await expect(
      backfillAgentHeadFields({ execute: false, logger, workspace })
    ).resolves.toEqual({ agentsToFill: 1, updated: 0 });

    await expect(
      backfillAgentHeadFields({ execute: true, logger, workspace })
    ).resolves.toEqual({ agentsToFill: 1, updated: 1 });

    const staleIdentity = await AgentModel.findOne({
      where: { sId: staleAgent.sId, workspaceId: workspace.id },
    });
    const freshIdentity = await AgentModel.findOne({
      where: { sId: freshAgent.sId, workspaceId: workspace.id },
    });
    assert(staleIdentity && freshIdentity);
    expect({
      name: staleIdentity.name,
      status: staleIdentity.status,
      scope: staleIdentity.scope,
      reinforcement: staleIdentity.reinforcement,
      lastReinforcementAnalysisAt: staleIdentity.lastReinforcementAnalysisAt,
      templateId: staleIdentity.templateId,
    }).toEqual({
      name: "Stale head",
      status: "active",
      scope: "visible",
      reinforcement: "auto",
      lastReinforcementAnalysisAt: null,
      templateId: null,
    });
    expect(freshIdentity.scope).toBe("hidden");

    await expect(
      backfillAgentHeadFields({ execute: true, logger, workspace })
    ).resolves.toEqual({ agentsToFill: 0, updated: 0 });
  });

  it("processes agents in batches", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    for (const name of ["First", "Second", "Third"]) {
      await AgentConfigurationFactory.createTestAgent(authenticator, { name });
    }
    await AgentModel.update(
      { status: "archived" },
      { where: { workspaceId: workspace.id } }
    );

    await expect(
      backfillAgentHeadFields({
        execute: true,
        logger,
        workspace,
        batchSize: 2,
      })
    ).resolves.toEqual({ agentsToFill: 3, updated: 3 });
  });
});
