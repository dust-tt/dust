import { Op } from "sequelize";

import {
  renderChildAgentConfiguration,
  renderDataSourceConfiguration,
  renderTableConfiguration,
} from "@app/lib/actions/configuration/helpers";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import {
  AgentMCPServerConfiguration,
  ChildAgentConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { Workspace } from "@app/lib/models/workspace";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import type { ModelId } from "@app/types";

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
  const allDataSourceConfigurations =
    await AgentDataSourceConfiguration.findAll({
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

  // Find the associated tables configurations.
  const allTablesConfigurations =
    await AgentTablesQueryConfigurationTable.findAll({
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

  // Find the associated child agent configurations.
  const allChildAgentConfigurations = await ChildAgentConfiguration.findAll({
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

    const dataSourceConfigurations = allDataSourceConfigurations.filter(
      (ds) => ds.mcpServerConfigurationId === config.id
    );
    const tablesConfigurations = allTablesConfigurations.filter(
      (tc) => tc.mcpServerConfigurationId === config.id
    );
    const childAgentConfigurations = allChildAgentConfigurations.filter(
      (ca) => ca.mcpServerConfigurationId === config.id
    );

    const mcpServerView = await MCPServerViewResource.fetchByModelPk(
      auth,
      mcpServerViewId
    );
    if (!mcpServerView) {
      throw new Error(
        `MCPServerView with mcpServerViewId ${mcpServerViewId} not found.`
      );
    }

    const { name, description } =
      await mcpServerView.getMCPServerMetadata(auth);

    if (!actionsByConfigurationId.has(agentConfigurationId)) {
      actionsByConfigurationId.set(agentConfigurationId, []);
    }

    const actions = actionsByConfigurationId.get(agentConfigurationId);
    if (actions) {
      actions.push({
        id,
        sId,
        type: "mcp_server_configuration",
        name,
        description,
        mcpServerViewId: mcpServerView.sId,
        dataSources: dataSourceConfigurations.map(
          renderDataSourceConfiguration
        ),
        tables: tablesConfigurations.map(renderTableConfiguration),
        childAgentId: childAgentConfigurations[0]
          ? renderChildAgentConfiguration(childAgentConfigurations[0])
          : null,
      });
    }
  }

  return actionsByConfigurationId;
}
