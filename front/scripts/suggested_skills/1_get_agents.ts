import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { Op } from "sequelize";

import {
  getInternalMCPServerNameAndWorkspaceId,
  INTERNAL_MCP_SERVERS,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { RemoteMCPServerModel } from "@app/lib/models/agent/actions/remote_mcp_server";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { ArgumentSpecs } from "@app/scripts/helpers";
import { makeScript } from "@app/scripts/helpers";
import type {
  Agent,
  AgentDatasource,
  AgentTool,
} from "@app/scripts/suggested_skills/types";

const argumentSpecs: ArgumentSpecs = {
  workspaceId: {
    type: "string",
    required: true,
    description: "The workspace sId (e.g., 0Kxxx...)",
  },
  limit: {
    type: "number",
    description: "Maximum number of agents to fetch (default: 60)",
  },
};

/**
 * Fetches agents from the database using Sequelize.
 *
 * Usage:
 *   npx tsx scripts/suggested_skills/1_get_agents.ts --workspaceId <workspaceId>
 */
makeScript(argumentSpecs, async (args, scriptLogger) => {
  const workspaceId = args.workspaceId as string;
  const limit = (args.limit as number) || 60;

  scriptLogger.info({ workspaceId }, "Starting agent data extraction");

  // Find the workspace
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace not found with sId: ${workspaceId}`);
  }

  scriptLogger.info(
    { workspaceId: workspace.id, workspaceName: workspace.name },
    "Found workspace"
  );

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Fetch active visible agents with their message counts
  const agentConfigs = await AgentConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      status: "active",
      scope: "visible",
    },
  });

  scriptLogger.info(
    { agentCount: agentConfigs.length },
    "Found active visible agents"
  );

  // Process each agent to get usage stats, tools, and datasources
  const agents: Agent[] = [];

  for (const agent of agentConfigs) {
    // Get message stats for this agent in the last 30 days
    const messageStats = await AgentMessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        agentConfigurationId: agent.sId,
        createdAt: { [Op.gte]: thirtyDaysAgo },
      },
      attributes: [
        [frontSequelize.fn("COUNT", frontSequelize.col("id")), "total"],
        [
          frontSequelize.fn("MIN", frontSequelize.col("createdAt")),
          "firstUsage",
        ],
        [
          frontSequelize.fn("MAX", frontSequelize.col("createdAt")),
          "lastUsage",
        ],
      ],
      raw: true,
    });

    const stats = messageStats[0] as unknown as {
      total: string;
      firstUsage: Date | null;
      lastUsage: Date | null;
    };

    const totalMessages = parseInt(stats.total || "0", 10);

    // Get MCP server configurations (tools) for this agent
    const mcpConfigs = await AgentMCPServerConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        agentConfigurationId: agent.id,
      },
      include: [
        {
          model: MCPServerViewModel,
          as: "mcpServerView",
          include: [
            {
              model: RemoteMCPServerModel,
              as: "remoteMCPServer",
              required: false,
            },
          ],
        },
      ],
    });

    const tools: AgentTool[] = [];
    for (const mcpConfig of mcpConfigs) {
      const mcpServerView = mcpConfig.mcpServerView;
      if (!mcpServerView) {
        continue;
      }

      const toolName =
        (mcpConfig.name ??
          mcpServerView.name ??
          mcpServerView.remoteMCPServer?.cachedName) ||
        mcpConfig.internalMCPServerId;

      const toolDescription =
        mcpConfig.singleToolDescriptionOverride ??
        mcpServerView.description ??
        mcpServerView.remoteMCPServer?.cachedDescription;

      const tool: AgentTool = {
        mcp_server_view_id: mcpServerView.id,
        tool_type: mcpServerView.serverType,
        tool_name: toolName ?? null,
        tool_description: toolDescription ?? null,
        internal_mcp_server_id: mcpServerView.internalMCPServerId,
        remote_mcp_server_id:
          mcpServerView.remoteMCPServerId?.toString() ?? null,
      };

      // Enrich internal tools with proper names and descriptions
      if (
        tool.tool_type === "internal" &&
        tool.internal_mcp_server_id?.startsWith("ims_")
      ) {
        const serverNameResult = getInternalMCPServerNameAndWorkspaceId(
          tool.internal_mcp_server_id
        );

        if (serverNameResult.isOk()) {
          const serverName = serverNameResult.value.name;
          const serverDef = INTERNAL_MCP_SERVERS[serverName];

          if (serverDef) {
            tool.internal_tool_name = serverDef.serverInfo.name;
            tool.internal_tool_description = serverDef.serverInfo.description;
          }
        }
      }

      tools.push(tool);
    }

    // Get datasource configurations for this agent
    const datasourceConfigs = await AgentDataSourceConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        mcpServerConfigurationId: {
          [Op.in]: mcpConfigs.map((c) => c.id),
        },
      },
      include: [
        {
          model: DataSourceModel,
          as: "dataSource",
        },
      ],
    });

    const dataSources: AgentDatasource[] = datasourceConfigs.map(
      (dsConfig) => ({
        datasource_description: dsConfig.dataSource.description,
        connector_provider: dsConfig.dataSource.connectorProvider,
      })
    );

    agents.push({
      agent_sid: agent.sId,
      agent_name: agent.name,
      description: agent.description,
      instructions: agent.instructions,
      total_messages: totalMessages,
      first_usage: stats.firstUsage,
      last_usage: stats.lastUsage,
      tools,
      dataSources,
    });
  }

  // Sort by total_messages descending and limit
  agents.sort((a, b) => b.total_messages - a.total_messages);
  const topAgents = agents.slice(0, limit);

  // Create output directory
  const outputDir = join(__dirname, workspaceId);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    scriptLogger.info({ outputDir }, "Created output directory");
  }

  // Write output
  const outputFilePath = join(outputDir, "agents.json");
  writeFileSync(outputFilePath, JSON.stringify(topAgents, null, 2));

  scriptLogger.info(
    {
      totalAgents: agentConfigs.length,
      outputAgents: topAgents.length,
      outputFile: outputFilePath,
    },
    "Successfully wrote agents to file"
  );
});
