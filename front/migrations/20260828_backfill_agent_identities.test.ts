import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
import { backfillAgentIdentities } from "@app/migrations/20260828_backfill_agent_identities";
import baseLogger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

const logger = baseLogger.child({}, { level: "silent" });

describe("backfillAgentIdentities", () => {
  it("creates one identity per agent and attaches every version idempotently", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const firstVersion =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      firstVersion.sId
    );
    await AgentConfigurationModel.update(
      { agentId: null },
      { where: { sId: firstVersion.sId, workspaceId: workspace.id } }
    );
    await AgentModel.destroy({
      where: { sId: firstVersion.sId, workspaceId: workspace.id },
    });

    const dryRun = await backfillAgentIdentities({
      execute: false,
      logger,
      workspace,
    });
    expect(dryRun).toMatchObject({
      logicalAgentCount: 1,
      identitiesToCreate: 1,
      versionsToAttach: 2,
      orphanIdentityCount: 0,
    });
    expect(
      await AgentModel.findOne({
        where: { sId: firstVersion.sId, workspaceId: workspace.id },
      })
    ).toBeNull();

    await backfillAgentIdentities({ execute: true, logger, workspace });
    const versions = await AgentConfigurationModel.findAll({
      where: { sId: firstVersion.sId, workspaceId: workspace.id },
      attributes: ["agentId"],
    });
    expect(versions.every(({ agentId }) => agentId !== null)).toBe(true);
    expect(new Set(versions.map(({ agentId }) => agentId)).size).toBe(1);

    const rerun = await backfillAgentIdentities({
      execute: true,
      logger,
      workspace,
    });
    expect(rerun.identitiesToCreate).toBe(0);
    expect(rerun.versionsToAttach).toBe(0);
  });

  it("rejects a version linked to another agent's identity", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const firstAgent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const secondAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Second agent" }
    );
    const secondIdentity = await AgentModel.findOne({
      where: { sId: secondAgent.sId, workspaceId: workspace.id },
    });
    if (!secondIdentity) {
      throw new Error("Expected the second agent identity to exist.");
    }
    await AgentConfigurationModel.update(
      { agentId: secondIdentity.id },
      { where: { sId: firstAgent.sId, workspaceId: workspace.id } }
    );

    await expect(
      backfillAgentIdentities({ execute: true, logger, workspace })
    ).rejects.toThrow(
      `Agent ${firstAgent.sId} is linked to an invalid identity.`
    );
  });
});
