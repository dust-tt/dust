import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { backfillAgentIdentities } from "@app/migrations/20260828_backfill_agent_identities";
import baseLogger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

const logger = baseLogger.child({}, { level: "silent" });

describe("backfillAgentIdentities", () => {
  it("rejects a version linked to another agent's identity", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const firstAgent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const secondIdentity = await AgentModel.create({
      sId: generateRandomModelSId(),
      workspaceId: workspace.id,
    });
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
