import type { IncludeOptions, WhereOptions } from "sequelize";
import { Op } from "sequelize";

import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import {
  renderDataSourceConfiguration,
  renderTableConfiguration,
} from "@app/lib/actions/configuration/helpers";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import {
  AgentChildAgentConfiguration,
  AgentMCPServerConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentReasoningConfiguration } from "@app/lib/models/assistant/actions/reasoning";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { AppResource } from "@app/lib/resources/app_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import logger from "@app/logger/logger";
import type { AgentFetchVariant, ModelId } from "@app/types";
import { removeNulls } from "@app/types";

export async function fetchMCPServerActionConfigurations(
  auth: Authenticator,
  {
    configurationIds,
    variant,
  }: {
    configurationIds: ModelId[];
    variant: AgentFetchVariant;
  }
): Promise<Map<ModelId, MCPServerConfigurationType[]>> {
  if (variant !== "full") {
    return new Map();
  }

  const mcpServerConfigurations = await AgentMCPServerConfiguration.findAll({
    where: {
      agentConfigurationId: { [Op.in]: configurationIds },
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  if (mcpServerConfigurations.length === 0) {
    return new Map();
  }

  const workspace = auth.getNonNullableWorkspace();

  const whereClause: WhereOptions<
    AgentDataSourceConfiguration &
      AgentTablesQueryConfigurationTable &
      AgentReasoningConfiguration &
      AgentChildAgentConfiguration
  > = {
    workspaceId: workspace.id,
    mcpServerConfigurationId: {
      [Op.in]: mcpServerConfigurations.map((r) => r.id),
    },
  };
  const includeDataSourceViewClause: IncludeOptions[] = [
    {
      model: DataSourceViewModel,
      as: "dataSourceView",
      include: [
        {
          model: WorkspaceModel,
          as: "workspace",
        },
      ],
    },
  ];

  const allDustApps = await AppResource.fetchByIds(
    auth,
    removeNulls(mcpServerConfigurations.map((r) => r.appId))
  );

  // Find the associated data sources configurations.
  const allDataSourceConfigurations =
    await AgentDataSourceConfiguration.findAll({
      where: whereClause,
      include: includeDataSourceViewClause,
    });

  // Find the associated tables configurations.
  const allTablesConfigurations =
    await AgentTablesQueryConfigurationTable.findAll({
      where: whereClause,
      include: includeDataSourceViewClause,
    });

  // Find the associated reasoning configurations.
  const allReasoningConfigurations = await AgentReasoningConfiguration.findAll({
    where: whereClause,
  });

  // Find the associated child agent configurations.
  const allChildAgentConfigurations =
    await AgentChildAgentConfiguration.findAll({ where: whereClause });

  const actionsByConfigurationId = new Map<
    ModelId,
    MCPServerConfigurationType[]
  >();
  for (const config of mcpServerConfigurations) {
    const { agentConfigurationId, mcpServerViewId } = config;

    const dataSourceConfigurations = allDataSourceConfigurations.filter(
      (ds) => ds.mcpServerConfigurationId === config.id
    );
    const tablesConfigurations = allTablesConfigurations.filter(
      (tc) => tc.mcpServerConfigurationId === config.id
    );
    const childAgentConfigurations = allChildAgentConfigurations.filter(
      (ca) => ca.mcpServerConfigurationId === config.id
    );
    const reasoningConfigurations = allReasoningConfigurations.filter(
      (rc) => rc.mcpServerConfigurationId === config.id
    );

    const dustApp = allDustApps.filter((app) => app.sId === config.appId)[0];

    const mcpServerView = await MCPServerViewResource.fetchByModelPk(
      auth,
      mcpServerViewId
    );
    let serverName: string | null = null;
    let serverDescription: string | null = null;
    let serverIcon:
      | InternalAllowedIconType
      | CustomResourceIconType
      | undefined = undefined;

    if (!mcpServerView) {
      logger.warn(
        `MCPServerView with mcpServerViewId ${mcpServerViewId} not found.`
      );
      serverName = "Missing";
      serverDescription = "Missing";
    } else {
      const { name, description, icon } = mcpServerView.toJSON().server;

      serverName = name;
      serverDescription = description;
      serverIcon = icon;
    }
    if (!actionsByConfigurationId.has(agentConfigurationId)) {
      actionsByConfigurationId.set(agentConfigurationId, []);
    }

    const actions = actionsByConfigurationId.get(agentConfigurationId);
    if (actions) {
      actions.push({
        id: config.id,
        sId: config.sId,
        type: "mcp_server_configuration",
        // Name will be either set from the agent config itself (user defined), from the mcp server view (user defined), or from the server itself (fetched from the metadata).
        name: config.name ?? mcpServerView?.name ?? serverName,
        description: config.singleToolDescriptionOverride ?? serverDescription,
        icon: serverIcon,
        mcpServerViewId: mcpServerView?.sId ?? "",
        internalMCPServerId: config.internalMCPServerId,
        dataSources: dataSourceConfigurations.map(
          renderDataSourceConfiguration
        ),
        tables: tablesConfigurations.map(renderTableConfiguration),
        dustAppConfiguration: dustApp
          ? {
              id: dustApp.id,
              name: dustApp.name,
              description: dustApp.description,
              appId: dustApp.sId,
              sId: dustApp.sId,
              appWorkspaceId: auth.getNonNullableWorkspace().sId,
              type: "dust_app_run_configuration",
            }
          : null,
        childAgentId:
          childAgentConfigurations.length > 0
            ? childAgentConfigurations[0].agentConfigurationId
            : null,
        additionalConfiguration: config.additionalConfiguration,
        reasoningModel:
          reasoningConfigurations.length > 0
            ? {
                providerId: reasoningConfigurations[0].providerId,
                modelId: reasoningConfigurations[0].modelId,
                temperature: reasoningConfigurations[0].temperature,
                reasoningEffort: reasoningConfigurations[0].reasoningEffort,
              }
            : null,
        timeFrame: config.timeFrame,
        jsonSchema: config.jsonSchema,
        secretName: config.secretName,
      });
    }
  }

  return actionsByConfigurationId;
}
