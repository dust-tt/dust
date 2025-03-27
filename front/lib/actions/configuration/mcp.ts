import { Op } from "sequelize";

import { getDataSource } from "@app/lib/actions/configuration/retrieval";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { getMCPServerMetadata } from "@app/lib/actions/mcp_actions";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { RemoteMCPServer } from "@app/lib/models/assistant/actions/remote_mcp_server";
import { Workspace } from "@app/lib/models/workspace";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import type { ModelId } from "@app/types";

export async function fetchMCPServerActionConfigurations({
  configurationIds,
  variant,
}: {
  configurationIds: ModelId[];
  variant: "light" | "full";
}): Promise<Map<ModelId, MCPServerConfigurationType[]>> {
  if (variant !== "full") {
    return new Map();
  }

  const mcpServerConfigurations = await AgentMCPServerConfiguration.findAll({
    where: { agentConfigurationId: { [Op.in]: configurationIds } },
  });

  if (mcpServerConfigurations.length === 0) {
    return new Map();
  }

  // Find the associated data sources configurations.
  const dataSourceConfigurations = await AgentDataSourceConfiguration.findAll({
    where: {
      mcpServerConfigurationId: {
        [Op.in]: mcpServerConfigurations.map((r) => r.id),
      },
    },
    include: [
      {
        model: DataSourceViewModel,
        as: "dataSourceView",
        include: [
          {
            model: Workspace,
            as: "workspace",
          },
        ],
      },
    ],
  });

  const actionsByConfigurationId = new Map<
    ModelId,
    MCPServerConfigurationType[]
  >();

  for (const config of mcpServerConfigurations) {
    const { agentConfigurationId, id, sId, serverType, internalMCPServerId } =
      config;

    const dataSourceConfiguration =
      dataSourceConfigurations.filter(
        (ds) => ds.mcpServerConfigurationId === config.id
      ) ?? [];

    let remoteMCPServerId: string | null = null;
    if (serverType === "remote" && config.remoteMCPServerId) {
      const remoteMCPServer = await RemoteMCPServer.findByPk(
        config.remoteMCPServerId
      );
      if (!remoteMCPServer) {
        throw new Error(
          `Remote MCP server with remoteMCPServerId ${sId} not found.`
        );
      }
      remoteMCPServerId = RemoteMCPServerResource.modelIdToSId({
        id: remoteMCPServer.id,
        workspaceId: remoteMCPServer.workspaceId,
      });
    }

    if (!actionsByConfigurationId.has(agentConfigurationId)) {
      actionsByConfigurationId.set(agentConfigurationId, []);
    }

    // Note: this won't attempt to connect to remote servers and will use the cached metadata.
    const metadata = await getMCPServerMetadata(config);

    const actions = actionsByConfigurationId.get(agentConfigurationId);
    if (actions) {
      actions.push({
        id,
        sId,
        type: "mcp_server_configuration",
        name: metadata.name,
        description: metadata.description,
        serverType,
        internalMCPServerId,
        remoteMCPServerId,
        dataSources: dataSourceConfiguration.map(getDataSource),
      });
    }
  }

  return actionsByConfigurationId;
}
