import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { backfillAgentCreatedAt } from "@app/migrations/20260915_backfill_agent_created_at";
import baseLogger from "@app/logger/logger";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import assert from "assert";
import { describe, expect, it } from "vitest";

const logger = baseLogger.child({}, { level: "silent" });

async function listCreatedAtByAgentId(
  auth: Authenticator,
  agentIds: string[]
): Promise<Map<string, Date>> {
  const agents = await AgentResource.fetchByIds(auth, agentIds);
  return new Map(agents.map((agent) => [agent.sId, agent.createdAt]));
}

// Agents that predate the identity backfill have configurations older than their `agents` row.
const FIRST_VERSION_DATE = new Date("2025-01-01T00:00:00.000Z");
const SECOND_VERSION_DATE = new Date("2025-06-01T00:00:00.000Z");

describe("backfillAgentCreatedAt", () => {
  it("moves a late identity back to its first configuration's date, idempotently", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const lateAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Late identity" }
    );
    await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      lateAgent.sId,
      { instructions: "A second version, created later." }
    );
    const freshAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Fresh identity" }
    );

    // Both versions predate the identity row, as for agents created before the identity backfill.
    await AgentConfigurationModel.update(
      { createdAt: FIRST_VERSION_DATE },
      { where: { sId: lateAgent.sId, workspaceId: workspace.id, version: 0 } }
    );
    await AgentConfigurationModel.update(
      { createdAt: SECOND_VERSION_DATE },
      { where: { sId: lateAgent.sId, workspaceId: workspace.id, version: 1 } }
    );
    const createdAtBefore = await listCreatedAtByAgentId(authenticator, [
      freshAgent.sId,
    ]);
    const freshCreatedAtBefore = createdAtBefore.get(freshAgent.sId);
    assert(freshCreatedAtBefore);

    await expect(
      backfillAgentCreatedAt({ execute: false, logger, workspace })
    ).resolves.toEqual({ agentsToFix: 1, updated: 0 });

    await expect(
      backfillAgentCreatedAt({ execute: true, logger, workspace })
    ).resolves.toEqual({ agentsToFix: 1, updated: 1 });

    const createdAtAfter = await listCreatedAtByAgentId(authenticator, [
      lateAgent.sId,
      freshAgent.sId,
    ]);
    const lateCreatedAt = createdAtAfter.get(lateAgent.sId);
    const freshCreatedAt = createdAtAfter.get(freshAgent.sId);
    assert(lateCreatedAt && freshCreatedAt);
    expect(lateCreatedAt.getTime()).toBe(FIRST_VERSION_DATE.getTime());
    expect(freshCreatedAt.getTime()).toBe(freshCreatedAtBefore.getTime());

    await expect(
      backfillAgentCreatedAt({ execute: true, logger, workspace })
    ).resolves.toEqual({ agentsToFix: 0, updated: 0 });
  });

  it("processes agents in batches", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    for (const name of ["First", "Second", "Third"]) {
      await AgentConfigurationFactory.createTestAgent(authenticator, { name });
    }
    await AgentConfigurationModel.update(
      { createdAt: FIRST_VERSION_DATE },
      { where: { workspaceId: workspace.id } }
    );

    await expect(
      backfillAgentCreatedAt({ execute: true, logger, workspace, batchSize: 2 })
    ).resolves.toEqual({ agentsToFix: 3, updated: 3 });
  });
});
