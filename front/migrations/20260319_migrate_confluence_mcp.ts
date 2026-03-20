import assert from "assert";
import fs from "fs";
import { Op } from "sequelize";

import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";

function loadAgentIds(agentsFile: string): string[] {
  const agentIds: unknown = JSON.parse(fs.readFileSync(agentsFile, "utf-8"));
  assert(Array.isArray(agentIds) && agentIds.every((id) => isString(id)), "agentsFile must contain a JSON array of agent IDs");

  return agentIds;
}

async function findAgentMCPConfigs(
  auth: Authenticator,
  agentIds: string[],
  oldView: MCPServerViewResource
): Promise<AgentMCPServerConfigurationModel[]> {
  const workspaceModelId = auth.getNonNullableWorkspace().id;

  const agentConfigurations = await AgentConfigurationModel.findAll({
    where: { workspaceId: workspaceModelId, sId: { [Op.in]: agentIds } },
  });

  const agentConfigurationModelIds = agentConfigurations.map((a) => a.id);

  return AgentMCPServerConfigurationModel.findAll({
    where: {
      workspaceId: workspaceModelId,
      agentConfigurationId: { [Op.in]: agentConfigurationModelIds },
      mcpServerViewId: oldView.id,
    },
  });
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
    },
    remoteServerId: {
      type: "string",
      demandOption: true,
      description:
        "The mcpServerId of the remote (open-source) Confluence view (rms_...)",
    },
    internalServerId: {
      type: "string",
      demandOption: true,
      description:
        "The mcpServerId of the internal Confluence view to migrate to (ims_...)",
    },
    agentsFile: {
      type: "string",
      demandOption: true,
      description: "Path to a JSON file containing an array of agent IDs to migrate",
    },
  },
  async (
    { workspaceId, remoteServerId, internalServerId, agentsFile, execute },
    logger
  ) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    assert(workspace, `Workspace not found: ${workspaceId}`);

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    const oldView = await MCPServerViewResource.getMCPServerViewForGlobalSpace(auth, remoteServerId);
    assert(oldView, `No remote Confluence MCP server view found for: ${remoteServerId}`);

    const newView = await MCPServerViewResource.getMCPServerViewForGlobalSpace(auth, internalServerId);
    assert(newView, `No internal Confluence MCP server view found for: ${internalServerId}`);

    const agentIds = loadAgentIds(agentsFile);

    logger.info({ oldView: oldView.toJSON(), newView: newView.toJSON(), count: agentIds.length }, "Loaded MCP server views and agent IDs.");

    const agentConfigs = await findAgentMCPConfigs(auth, agentIds, oldView);

    logger.info(
      { count: agentConfigs.length },
      execute
        ? "Migrating agent MCP server configurations"
        : "Would migrate agent MCP server configurations (dry run)"
    );

    for (const config of agentConfigs) {
      logger.info(
        { configId: config.sId, oldViewId: config.mcpServerViewId, newViewId: newView.id },
        execute ? "Updating agent config" : "Would update agent config"
      );

      if (execute) {
        await config.update({
          mcpServerViewId: newView.id,
          internalMCPServerId: internalServerId,
        });
      }
    }

    logger.info(
      { migratedCount: agentConfigs.length, execute },
      execute ? "Migration complete" : "Dry run complete"
    );
  }
);
