import { Op } from "sequelize";

import { getDataSource } from "@app/lib/actions/configuration/retrieval";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { ModelId } from "@app/types";
import { assertNever } from "@app/types";

export async function fetchMCPServerActionConfigurations(
  auth: Authenticator,
  {
    configurationIds,
    variant,
  }: {
    configurationIds: ModelId[];
    variant: "light" | "full";
  }
): Promise<Map<ModelId, MCPServerConfigurationType[]>> {
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
  });

  const actionsByConfigurationId = new Map<
    ModelId,
    MCPServerConfigurationType[]
  >();

  for (const config of mcpServerConfigurations) {
    const { agentConfigurationId, sId, id, mcpServerViewId } = config;

    const dataSourceConfiguration =
      dataSourceConfigurations.filter(
        (ds) => ds.mcpServerConfigurationId === config.id
      ) ?? [];

    const mcpServerView = await MCPServerViewResource.fetchByModelPk(
      auth,
      mcpServerViewId
    );

    if (!mcpServerView) {
      throw new Error(
        `MCPServerView with mcpServerViewId ${mcpServerViewId} not found.`
      );
    }

    let metadata: MCPServerType | null = null;
    if (mcpServerView.serverType === "remote") {
      const remoteMCPServer = mcpServerView.getRemoteMCPServer();

      // Note: this won't attempt to connect to remote servers and will use the cached metadata.
      metadata = remoteMCPServer.toJSON();
    } else if (mcpServerView.serverType === "internal") {
      if (!mcpServerView.internalMCPServerId) {
        throw new Error(
          `Internal MCP server ID is required for internal server type.`
        );
      }

      const internalMCPServer =
        await InternalMCPServerInMemoryResource.fetchById(
          auth,
          mcpServerView.internalMCPServerId
        );

      if (!internalMCPServer) {
        throw new Error(
          `Internal MCP server with ID ${mcpServerView.internalMCPServerId} not found.`
        );
      }

      metadata = internalMCPServer.toJSON();
    } else {
      assertNever(mcpServerView.serverType);
    }

    if (!actionsByConfigurationId.has(agentConfigurationId)) {
      actionsByConfigurationId.set(agentConfigurationId, []);
    }

    const actions = actionsByConfigurationId.get(agentConfigurationId);
    if (actions) {
      actions.push({
        id,
        sId,
        type: "mcp_server_configuration",
        name: metadata.name,
        description: metadata.description,
        mcpServerViewId: mcpServerView.sId,
        dataSources: dataSourceConfiguration.map(getDataSource),
      });
    }
  }

  return actionsByConfigurationId;
}
