import { Op } from "sequelize";

import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeScript } from "@app/scripts/helpers";

const CUTOFF_DATE = new Date("2026-03-16T14:20:00Z");
const OLD_MODEL_ID = "claude-haiku-4-5-20251001";
const NEW_MODEL_ID = "claude-sonnet-4-6";

const AgentConfigurationModelWithBypass: ModelStaticWorkspaceAware<AgentConfigurationModel> =
  AgentConfigurationModel;

makeScript({}, async ({ execute }, logger) => {
  // Find all active agent configurations using the old model.
  const activeAgents = await AgentConfigurationModelWithBypass.findAll({
    where: {
      modelId: OLD_MODEL_ID,
      status: "active",
    },
    // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  logger.info(
    {
      count: activeAgents.length,
      modelId: OLD_MODEL_ID,
      cutoff: CUTOFF_DATE.toISOString(),
    },
    `Found ${activeAgents.length} active agents using model ${OLD_MODEL_ID}. Checking for creation date after ${CUTOFF_DATE.toISOString()}...`
  );

  // For each active agent, check that version 0 was created after the cutoff.
  // This filters out agents that existed before and were just updated.
  const agentsToUpdate: AgentConfigurationModel[] = [];

  for (const agent of activeAgents) {
    const firstVersion = await AgentConfigurationModelWithBypass.findOne({
      where: {
        sId: agent.sId,
        version: 0,
        createdAt: { [Op.gt]: CUTOFF_DATE },
      },
      // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    if (firstVersion) {
      agentsToUpdate.push(agent);
    }
  }

  logger.info(
    { count: agentsToUpdate.length },
    `Found ${agentsToUpdate.length} agents to update from ${OLD_MODEL_ID} to ${NEW_MODEL_ID}.`
  );

  if (agentsToUpdate.length === 0) {
    return;
  }

  for (const agent of agentsToUpdate) {
    logger.info(
      {
        sId: agent.sId,
        version: agent.version,
        workspaceId: agent.workspaceId,
      },
      `Updating agent ${agent.sId} (version ${agent.version}).`
    );

    if (execute) {
      await agent.update({ modelId: NEW_MODEL_ID });
    }
  }

  logger.info("Migration complete.");
});
