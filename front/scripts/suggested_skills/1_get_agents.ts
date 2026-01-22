import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { Logger } from "pino";
import { Op } from "sequelize";

import {
  getInternalMCPServerInfo,
  getInternalMCPServerNameAndWorkspaceId,
  isInternalMCPServerName,
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
import { makeScript } from "@app/scripts/helpers";
import type {
  Agent,
  AgentDatasource,
  AgentTool,
} from "@app/scripts/suggested_skills/types";
import type { ModelId } from "@app/types";

async function fetchWorkspace(workspaceId: string): Promise<WorkspaceResource> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }
  return workspace;
}

async function fetchActiveAgents(
  workspaceModelId: ModelId
): Promise<AgentConfigurationModel[]> {
  return AgentConfigurationModel.findAll({
    where: {
      workspaceId: workspaceModelId,
      status: "active",
      scope: "visible",
    },
  });
}

async function fetchMessageStats(
  workspaceModelId: ModelId,
  agentSId: string,
  since: Date
) {
  const messageStats = await AgentMessageModel.findAll({
    where: {
      workspaceId: workspaceModelId,
      agentConfigurationId: agentSId,
      createdAt: { [Op.gte]: since },
    },
    attributes: [
      [frontSequelize.fn("COUNT", frontSequelize.col("id")), "total"],
      [frontSequelize.fn("MIN", frontSequelize.col("createdAt")), "firstUsage"],
      [frontSequelize.fn("MAX", frontSequelize.col("createdAt")), "lastUsage"],
    ],
    raw: true,
  });

  const stats = messageStats[0] as unknown as {
    total: string;
    firstUsage: Date | null;
    lastUsage: Date | null;
  };

  return {
    totalMessages: parseInt(stats.total || "0", 10),
    firstUsage: stats.firstUsage,
    lastUsage: stats.lastUsage,
  };
}

async function fetchAgentTools(
  workspaceModelId: ModelId,
  agentModelId: ModelId
): Promise<AgentTool[]> {
  const mcpConfigs = await AgentMCPServerConfigurationModel.findAll({
    where: {
      workspaceId: workspaceModelId,
      agentConfigurationId: agentModelId,
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
      remote_mcp_server_id: mcpServerView.remoteMCPServerId?.toString() ?? null,
    };

    enrichInternalToolMetadata(tool);
    tools.push(tool);
  }

  return tools;
}

function enrichInternalToolMetadata(tool: AgentTool): void {
  if (
    tool.tool_type === "internal" &&
    tool.internal_mcp_server_id?.startsWith("ims_")
  ) {
    const serverNameResult = getInternalMCPServerNameAndWorkspaceId(
      tool.internal_mcp_server_id
    );

    if (serverNameResult.isOk()) {
      const serverName = serverNameResult.value.name;
      if (isInternalMCPServerName(serverName)) {
        const serverInfo = getInternalMCPServerInfo(serverName);
        tool.internal_tool_name = serverInfo.name;
        tool.internal_tool_description = serverInfo.description ?? undefined;
      }
    }
  }
}

async function fetchAgentDataSources(
  workspaceModelId: ModelId,
  mcpConfigIds: ModelId[]
): Promise<AgentDatasource[]> {
  if (mcpConfigIds.length === 0) {
    return [];
  }

  const datasourceConfigs = await AgentDataSourceConfigurationModel.findAll({
    where: {
      workspaceId: workspaceModelId,
      mcpServerConfigurationId: { [Op.in]: mcpConfigIds },
    },
    include: [{ model: DataSourceModel, as: "dataSource" }],
  });

  const results: AgentDatasource[] = [];
  for (const dsConfig of datasourceConfigs) {
    const provider = dsConfig.dataSource.connectorProvider;
    if (provider !== null) {
      results.push({
        datasource_description: dsConfig.dataSource.description,
        connector_provider: provider,
      });
    }
  }
  return results;
}

async function buildAgentData(
  workspaceModelId: ModelId,
  agent: AgentConfigurationModel,
  since: Date
): Promise<Agent> {
  const stats = await fetchMessageStats(workspaceModelId, agent.sId, since);
  const tools = await fetchAgentTools(workspaceModelId, agent.id);

  const mcpConfigs = await AgentMCPServerConfigurationModel.findAll({
    where: { workspaceId: workspaceModelId, agentConfigurationId: agent.id },
  });
  const dataSources = await fetchAgentDataSources(
    workspaceModelId,
    mcpConfigs.map((c) => c.id)
  );

  return {
    agent_sid: agent.sId,
    agent_name: agent.name,
    description: agent.description,
    instructions: agent.instructions,
    total_messages: stats.totalMessages,
    first_usage: stats.firstUsage,
    last_usage: stats.lastUsage,
    tools,
    dataSources,
  };
}

function writeAgentsToFile(
  agents: Agent[],
  workspaceId: string,
  logger: Logger
): string {
  const outputDir = join(__dirname, workspaceId);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    logger.info({ outputDir }, "Created output directory");
  }

  const outputFilePath = join(outputDir, "agents.json");
  writeFileSync(outputFilePath, JSON.stringify(agents, null, 2));
  return outputFilePath;
}

/**
 * Fetches agents from the database using Sequelize.
 *
 * Usage:
 *   npx tsx scripts/suggested_skills/1_get_agents.ts --workspaceId <workspaceId>
 */
makeScript(
  {
    workspaceId: {
      type: "string",
    },
    limit: {
      type: "number",
      description: "Maximum number of agents to fetch",
      default: 30,
    },
  },
  async ({ workspaceId, limit }, logger) => {
    const workspace = await fetchWorkspace(workspaceId);
    const agentConfigs = await fetchActiveAgents(workspace.id);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    logger.info({ agentCount: agentConfigs.length }, "Processing agents");

    const agents: Agent[] = [];
    for (const agent of agentConfigs) {
      const agentData = await buildAgentData(
        workspace.id,
        agent,
        thirtyDaysAgo
      );
      agents.push(agentData);
    }

    agents.sort((a, b) => b.total_messages - a.total_messages);
    const topAgents = agents.slice(0, limit);

    const outputFilePath = writeAgentsToFile(topAgents, workspaceId, logger);

    logger.info(
      {
        totalAgents: agentConfigs.length,
        outputAgents: topAgents.length,
        outputFile: outputFilePath,
      },
      "Done"
    );
  }
);
