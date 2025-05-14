import * as fs from "fs";

import { Authenticator } from "@app/lib/auth";
import { AgentBrowseConfiguration } from "@app/lib/models/assistant/actions/browse";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentWebsearchConfiguration } from "@app/lib/models/assistant/actions/websearch";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { Workspace } from "@app/lib/models/workspace";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { LoggerInterface } from "@app/types";

import { makeScript } from "../scripts/helpers";

const argumentSpecs = {
  workspaceSid: {
    type: "string" as const,
    describe:
      "Optional workspace SID to migrate. If not provided, will migrate all workspaces.",
  },
};

async function migrateWorkspace(
  workspace: Workspace,
  logger: LoggerInterface,
  execute: boolean
): Promise<string> {
  // Create internal authenticator
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // Ensure all auto tools are created
  await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

  // Get MCP server view for the combined tool
  const mcpServerView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "web_search_&_browse"
    );

  if (!mcpServerView) {
    logger.error(
      {
        workspaceId: workspace.sId,
      },
      "Failed to get MCP server view for web_search_&_browse"
    );
    return "";
  }

  let revertSql = "";

  // List all active agent configurations with browse or websearch
  const agentConfigs = await AgentConfiguration.findAll({
    where: {
      workspaceId: workspace.id,
      status: "active",
    },
    include: [
      {
        model: AgentBrowseConfiguration,
        required: false,
        as: "browseConfigurations",
      },
      {
        model: AgentWebsearchConfiguration,
        required: false,
        as: "websearchConfigurations",
      },
    ],
  });

  for (const agentConfig of agentConfigs) {
    const hasBrowse = agentConfig.browseConfigurations.length > 0;
    const hasWebsearch = agentConfig.websearchConfigurations.length > 0;

    if (!hasBrowse && !hasWebsearch) {
      continue;
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        agentConfigurationId: agentConfig.sId,
        hasBrowse,
        hasWebsearch,
        execute,
      },
      "Migrating agent configuration"
    );

    if (execute) {
      // Create MCP server configuration
      const mcpServerConfig = await AgentMCPServerConfiguration.create({
        sId: generateRandomModelSId(),
        workspaceId: workspace.id,
        agentConfigurationId: agentConfig.id,
        mcpServerViewId: mcpServerView.id,
        internalMCPServerId: mcpServerView.internalMCPServerId,
        additionalConfiguration: {},
        timeFrame: null,
      });

      revertSql += `DELETE FROM agent_mcp_server_configurations WHERE id = ${mcpServerConfig.id};`;

      // Delete old configurations
      for (const browseConfig of agentConfig.browseConfigurations) {
        await browseConfig.destroy();
        revertSql += `INSERT INTO agent_browse_configurations (id, created_at, updated_at, agent_configuration_id, name, description) VALUES (${browseConfig.id}, ${browseConfig.createdAt}, ${browseConfig.updatedAt}, ${agentConfig.id}, ${browseConfig.name}, ${browseConfig.description});`;
      }
      for (const websearchConfig of agentConfig.websearchConfigurations) {
        await websearchConfig.destroy();
        revertSql += `INSERT INTO agent_websearch_configurations (id, created_at, updated_at, agent_configuration_id, name, description) VALUES (${websearchConfig.id}, ${websearchConfig.createdAt}, ${websearchConfig.updatedAt}, ${agentConfig.id}, ${websearchConfig.name}, ${websearchConfig.description});`;
      }

      logger.info(
        {
          workspaceId: workspace.sId,
          agentConfigurationId: agentConfig.sId,
        },
        "Successfully migrated agent configuration"
      );
    } else {
      logger.info(
        {
          workspaceId: workspace.sId,
          agentConfigurationId: agentConfig.sId,
        },
        "Would migrate agent configuration (dry run)"
      );
    }
  }

  return revertSql;
}

async function main(
  args: { workspaceId?: string; execute: boolean },
  logger: LoggerInterface
) {
  let revertSql = "";
  if (args.workspaceId) {
    const workspace = await Workspace.findOne({
      where: {
        sId: args.workspaceId,
      },
    });

    if (!workspace) {
      throw new Error(`Workspace ${args.workspaceId} not found`);
    }

    revertSql += await migrateWorkspace(workspace, logger, args.execute);
  } else {
    const workspaces = await Workspace.findAll();
    logger.info(
      {
        workspaceCount: workspaces.length,
      },
      "Migrating all workspaces"
    );

    for (const workspace of workspaces) {
      revertSql += await migrateWorkspace(workspace, logger, args.execute);
    }
  }
  if (args.execute) {
    const now = new Date().toISOString();
    fs.writeFileSync(`websearch_to_mcp_revert_${now}.sql`, revertSql);
  }
}

makeScript(argumentSpecs, main);
