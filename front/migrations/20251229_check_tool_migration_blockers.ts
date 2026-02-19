import type { Logger } from "pino";

import {
  isAutoInternalMCPServerName,
  isInternalMCPServerName,
  type AutoInternalMCPServerNameType,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

interface BlockedWorkspace {
  sId: string;
  name: string;
  childAgentCount: number;
  dataSourceCount: number;
  tableConfigCount: number;
  affectedMcpConfigCount: number;
}

interface FailedWorkspace {
  sId: string;
  name: string;
  error: string;
}

async function checkWorkspace(
  workspace: LightWorkspaceType,
  logger: Logger,
  { mcpServerName }: { mcpServerName: AutoInternalMCPServerNameType }
): Promise<BlockedWorkspace | null> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const mcpServerView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      mcpServerName
    );

  if (!mcpServerView) {
    return null;
  }

  // Find all MCP server configs for active agents using this tool.
  const agentsWithTool = await AgentMCPServerConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      mcpServerViewId: mcpServerView.id,
    },
    include: [
      {
        model: AgentConfigurationModel,
        required: true,
        where: { status: "active" },
        attributes: [],
      },
    ],
  });

  if (agentsWithTool.length === 0) {
    return null;
  }

  const mcpConfigIds = agentsWithTool.map((a) => a.id);

  // Check for child records.
  const [childAgents, dataSources, tableConfigs] = await Promise.all([
    AgentChildAgentConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        mcpServerConfigurationId: mcpConfigIds,
      },
    }),
    AgentDataSourceConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        mcpServerConfigurationId: mcpConfigIds,
      },
    }),
    AgentTablesQueryConfigurationTableModel.findAll({
      where: {
        workspaceId: workspace.id,
        mcpServerConfigurationId: mcpConfigIds,
      },
    }),
  ]);

  const hasBlockers =
    childAgents.length > 0 || dataSources.length > 0 || tableConfigs.length > 0;

  if (!hasBlockers) {
    return null;
  }

  logger.info(
    {
      workspaceSId: workspace.sId,
      childAgentCount: childAgents.length,
      dataSourceCount: dataSources.length,
      tableConfigCount: tableConfigs.length,
    },
    "Found blocked workspace"
  );

  return {
    sId: workspace.sId,
    name: workspace.name,
    childAgentCount: childAgents.length,
    dataSourceCount: dataSources.length,
    tableConfigCount: tableConfigs.length,
    affectedMcpConfigCount: agentsWithTool.length,
  };
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Optional workspace sId to run on single workspace",
    },
    mcpServerName: {
      type: "string",
      required: true,
      description: "MCP server name (interactive_content or deep_dive)",
    },
  },
  async ({ workspaceId, mcpServerName }, logger) => {
    if (
      !(
        isInternalMCPServerName(mcpServerName) &&
        isAutoInternalMCPServerName(mcpServerName)
      )
    ) {
      throw new Error(`Invalid MCP server name: ${mcpServerName}`);
    }

    const blockedWorkspaces: BlockedWorkspace[] = [];
    const failedWorkspaces: FailedWorkspace[] = [];

    const processWorkspace = async (workspace: LightWorkspaceType) => {
      try {
        const result = await checkWorkspace(workspace, logger, {
          mcpServerName,
        });
        if (result) {
          blockedWorkspaces.push(result);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        logger.error(
          { workspaceSId: workspace.sId, error: errorMessage },
          "Failed to check workspace"
        );
        failedWorkspaces.push({
          sId: workspace.sId,
          name: workspace.name,
          error: errorMessage,
        });
      }
    };

    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      await processWorkspace(renderLightWorkspaceType({ workspace }));
    } else {
      await runOnAllWorkspaces(processWorkspace);
    }

    // Print report.
    console.log("\n=== Migration Blocker Report ===");
    console.log(`MCP Server: ${mcpServerName}\n`);

    if (blockedWorkspaces.length === 0) {
      console.log("No blocked workspaces found.");
    } else {
      console.log("Blocked workspaces:");
      for (const ws of blockedWorkspaces) {
        const blockers: string[] = [];
        if (ws.childAgentCount > 0) {
          blockers.push(`${ws.childAgentCount} child agents`);
        }
        if (ws.dataSourceCount > 0) {
          blockers.push(`${ws.dataSourceCount} data sources`);
        }
        if (ws.tableConfigCount > 0) {
          blockers.push(`${ws.tableConfigCount} table configs`);
        }
        console.log(
          `- ${ws.sId} (${ws.name}): ${ws.affectedMcpConfigCount} configs with ${blockers.join(", ")}`
        );
      }
    }

    if (failedWorkspaces.length > 0) {
      console.log("\nFailed workspaces:");
      for (const ws of failedWorkspaces) {
        console.log(`- ${ws.sId} (${ws.name}): ${ws.error}`);
      }
    }

    console.log(
      `\nSummary: ${blockedWorkspaces.length} blocked, ${failedWorkspaces.length} failed\n`
    );
  }
);
