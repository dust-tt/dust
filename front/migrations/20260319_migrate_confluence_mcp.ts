import assert from "assert";
import { format } from "date-fns";
import fs from "fs";
import { Op } from "sequelize";

import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import { isString } from "@app/types/shared/utils/general";

function loadAgentIds(agentsFile: string): string[] {
  const agentIds: unknown = JSON.parse(fs.readFileSync(agentsFile, "utf-8"));
  assert(
    Array.isArray(agentIds) && agentIds.every((id) => isString(id)),
    "agentsFile must contain a JSON array of agent IDs"
  );

  return agentIds;
}

async function findAgentMCPConfigs(
  auth: Authenticator,
  agentIds: string[],
  oldView: MCPServerViewResource
): Promise<{
  configs: AgentMCPServerConfigurationModel[];
  matchedAgentIds: Set<string>;
}> {
  const workspaceModelId = auth.getNonNullableWorkspace().id;

  const agentConfigurations = await AgentConfigurationModel.findAll({
    where: { workspaceId: workspaceModelId, sId: { [Op.in]: agentIds }, status: "active" },
  });

  const matchedAgentIds = new Set(agentConfigurations.map((a) => a.sId));
  const agentConfigurationModelIds = agentConfigurations.map((a) => a.id);

  const configs = await AgentMCPServerConfigurationModel.findAll({
    where: {
      workspaceId: workspaceModelId,
      agentConfigurationId: { [Op.in]: agentConfigurationModelIds },
      mcpServerViewId: oldView.id,
    },
  });

  return { configs, matchedAgentIds };
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
    },
    originRemoteServerId: {
      type: "string",
      demandOption: true,
      description: "The mcpServerId of the remote MCP server to migrate from",
    },
    destinationInternalServerId: {
      type: "string",
      demandOption: true,
      description: "The mcpServerId of the internal MCP server to migrate to",
    },
    agentsFile: {
      type: "string",
      demandOption: true,
      description:
        "Path to a JSON file containing an array of agent IDs to migrate",
    },
  },
  async (
    {
      workspaceId,
      originRemoteServerId,
      destinationInternalServerId,
      agentsFile,
      execute,
    },
    logger
  ) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    assert(workspace, `Workspace not found: ${workspaceId}`);

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    const originView =
      await MCPServerViewResource.getMCPServerViewForGlobalSpace(
        auth,
        originRemoteServerId
      );
    assert(
      originView,
      `No remote MCP server view found for: ${originRemoteServerId}`
    );

    const destinationView =
      await MCPServerViewResource.getMCPServerViewForGlobalSpace(
        auth,
        destinationInternalServerId
      );
    assert(
      destinationView,
      `No internal MCP server view found for: ${destinationInternalServerId}`
    );

    const agentIds = loadAgentIds(agentsFile);

    logger.info(
      {
        originView: originView.toJSON(),
        destinationView: destinationView.toJSON(),
        count: agentIds.length,
      },
      "Loaded MCP server views and agent IDs."
    );

    const { configs: agentConfigs, matchedAgentIds } = await findAgentMCPConfigs(
      auth,
      agentIds,
      originView
    );

    const unmatchedAgentIds = agentIds.filter((id) => !matchedAgentIds.has(id));
    if (unmatchedAgentIds.length > 0) {
      logger.warn(
        { unmatchedAgentIds, count: unmatchedAgentIds.length },
        "Some agent IDs from the file had no matching MCP config for the origin view"
      );
    }

    logger.info(
      { count: agentConfigs.length },
      execute
        ? "Migrating agent MCP server configurations"
        : "Would migrate agent MCP server configurations (dry run)"
    );

    const now = format(new Date(), "yyyy-MM-dd");
    const revertFile = `${now}_migrate_mcp_revert.sql`;
    let revertSql = "";

    try {
      for (const config of agentConfigs) {
        logger.info(
          { configId: config.sId, configModelId: config.id },
          execute ? "Updating agent config" : "Would update agent config"
        );

        if (execute) {
          const internalMCPServerId =
            config.internalMCPServerId !== null
              ? `'${config.internalMCPServerId}'`
              : "NULL";
          revertSql += `UPDATE agent_mcp_server_configurations SET "mcpServerViewId" = ${config.mcpServerViewId}, "internalMCPServerId" = ${internalMCPServerId} WHERE id = ${config.id};\n`;
          await config.update({
            mcpServerViewId: destinationView.id,
            internalMCPServerId: destinationInternalServerId,
          });
        }
      }
    } finally {
      if (execute && revertSql.length > 0) {
        fs.writeFileSync(revertFile, revertSql);
        logger.info({ revertFile }, "Revert SQL written");
      }
    }

    logger.info(
      { migratedCount: agentConfigs.length },
      execute ? "Migration complete" : "Dry run complete"
    );
  }
);
