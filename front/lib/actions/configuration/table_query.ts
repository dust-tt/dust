import _ from "lodash";
import { Op } from "sequelize";

import { renderTableConfiguration } from "@app/lib/actions/configuration/helpers";
import { DEFAULT_TABLES_QUERY_ACTION_NAME } from "@app/lib/actions/constants";
import type { TablesQueryConfigurationType } from "@app/lib/actions/tables_query";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentTablesQueryConfiguration,
  AgentTablesQueryConfigurationTable,
} from "@app/lib/models/assistant/actions/tables_query";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import type { AgentFetchVariant, ModelId } from "@app/types";

export async function fetchTableQueryActionConfigurations(
  auth: Authenticator,
  {
    configurationIds,
    variant,
  }: {
    configurationIds: ModelId[];
    variant: AgentFetchVariant;
  }
): Promise<Map<ModelId, TablesQueryConfigurationType[]>> {
  if (variant !== "full") {
    return new Map();
  }

  const tableQueryConfigurations = await AgentTablesQueryConfiguration.findAll({
    where: {
      agentConfigurationId: { [Op.in]: configurationIds },
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  if (tableQueryConfigurations.length === 0) {
    return new Map();
  }

  const agentTablesQueryConfigurationTables =
    await AgentTablesQueryConfigurationTable.findAll({
      where: {
        tablesQueryConfigurationId: {
          [Op.in]: tableQueryConfigurations.map((r) => r.id),
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

  const groupedAgentTablesQueryConfigurationTables = _.groupBy(
    agentTablesQueryConfigurationTables,
    "tablesQueryConfigurationId"
  );

  const groupedTableQueryConfigurations = _.groupBy(
    tableQueryConfigurations,
    "agentConfigurationId"
  );

  const actionsByConfigurationId: Map<ModelId, TablesQueryConfigurationType[]> =
    new Map();
  for (const [agentConfigurationId, configs] of Object.entries(
    groupedTableQueryConfigurations
  )) {
    const actions: TablesQueryConfigurationType[] = [];
    for (const c of configs) {
      const tablesQueryConfigTables =
        groupedAgentTablesQueryConfigurationTables[c.id] ?? [];

      actions.push({
        id: c.id,
        sId: c.sId,
        type: "tables_query_configuration",
        tables: tablesQueryConfigTables.map(renderTableConfiguration),
        name: c.name || DEFAULT_TABLES_QUERY_ACTION_NAME,
        description: c.description,
      });
    }

    actionsByConfigurationId.set(parseInt(agentConfigurationId, 10), actions);
  }

  return actionsByConfigurationId;
}
