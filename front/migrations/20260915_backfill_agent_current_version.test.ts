import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
import { backfillAgentCurrentVersion } from "@app/migrations/20260915_backfill_agent_current_version";
import baseLogger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import assert from "assert";
import { describe, expect, it } from "vitest";

const logger = baseLogger.child({}, { level: "silent" });

describe("backfillAgentCurrentVersion", () => {
  it("moves stale agents to their highest version, idempotently", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const staleAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Stale pointer" }
    );
    const latestVersion = await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      staleAgent.sId
    );
    const freshAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Fresh pointer" }
    );

    // Simulate an agent upgraded before the column existed: still at the default 0.
    await AgentModel.update(
      { currentVersion: 0 },
      { where: { sId: staleAgent.sId, workspaceId: workspace.id } }
    );

    await expect(
      backfillAgentCurrentVersion({ execute: false, logger, workspace })
    ).resolves.toEqual({
      agentsToPoint: 1,
      updated: 0,
      orphanIdentities: 0,
      orphanIdentitiesDeleted: 0,
    });

    await expect(
      backfillAgentCurrentVersion({ execute: true, logger, workspace })
    ).resolves.toEqual({
      agentsToPoint: 1,
      updated: 1,
      orphanIdentities: 0,
      orphanIdentitiesDeleted: 0,
    });

    const staleIdentity = await AgentModel.findOne({
      where: { sId: staleAgent.sId, workspaceId: workspace.id },
    });
    const freshIdentity = await AgentModel.findOne({
      where: { sId: freshAgent.sId, workspaceId: workspace.id },
    });
    assert(staleIdentity && freshIdentity);
    expect(staleIdentity.currentVersion).toBe(latestVersion.version);
    expect(freshIdentity.currentVersion).toBe(0);

    await expect(
      backfillAgentCurrentVersion({ execute: true, logger, workspace })
    ).resolves.toEqual({
      agentsToPoint: 0,
      updated: 0,
      orphanIdentities: 0,
      orphanIdentitiesDeleted: 0,
    });
  });

  it("deletes identities without any configuration", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Orphan identity" }
    );
    const kept = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Kept agent" }
    );
    // Leave the identity behind, as a hard delete that stopped short of the identity would.
    await AgentConfigurationModel.destroy({
      where: { sId: agent.sId, workspaceId: workspace.id },
    });

    await expect(
      backfillAgentCurrentVersion({ execute: true, logger, workspace })
    ).resolves.toEqual({
      agentsToPoint: 0,
      updated: 0,
      orphanIdentities: 1,
      orphanIdentitiesDeleted: 1,
    });

    expect(
      await AgentModel.findOne({
        where: { sId: agent.sId, workspaceId: workspace.id },
      })
    ).toBeNull();
    expect(
      await AgentModel.findOne({
        where: { sId: kept.sId, workspaceId: workspace.id },
      })
    ).not.toBeNull();
  });

  it("processes agents in batches", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    for (const name of ["First", "Second", "Third"]) {
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name }
      );
      await AgentConfigurationFactory.updateTestAgent(
        authenticator,
        agent.sId,
        {
          name,
        }
      );
    }
    await AgentModel.update(
      { currentVersion: 0 },
      { where: { workspaceId: workspace.id } }
    );

    await expect(
      backfillAgentCurrentVersion({
        execute: true,
        logger,
        workspace,
        batchSize: 2,
      })
    ).resolves.toMatchObject({ agentsToPoint: 3, updated: 3 });
  });
});
