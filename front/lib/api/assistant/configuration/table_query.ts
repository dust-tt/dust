import type { ModelId, TablesQueryConfigurationType } from "@dust-tt/types";
import _ from "lodash";
import { Op } from "sequelize";

import { DEFAULT_TABLES_QUERY_ACTION_NAME } from "@app/lib/api/assistant/actions/names";
import {
  AgentTablesQueryConfiguration,
  AgentTablesQueryConfigurationTable,
} from "@app/lib/models/assistant/actions/tables_query";

export async function fetchTableQueryActionConfigurations({
  configurationIds,
  variant,
}: {
  configurationIds: ModelId[];
  variant: "light" | "full";
}): Promise<Map<ModelId, TablesQueryConfigurationType[]>> {
  if (variant !== "full") {
    return new Map();
  }

  const tableQueryConfigurations = await AgentTablesQueryConfiguration.findAll({
    where: {
      agentConfigurationId: { [Op.in]: configurationIds },
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
        tables: tablesQueryConfigTables.map((tablesQueryConfigTable) => ({
          dataSourceId: tablesQueryConfigTable.dataSourceId,
          workspaceId: tablesQueryConfigTable.dataSourceWorkspaceId,
          tableId: tablesQueryConfigTable.tableId,
        })),
        name: c.name || DEFAULT_TABLES_QUERY_ACTION_NAME,
        description: c.description,
      });
    }

    actionsByConfigurationId.set(parseInt(agentConfigurationId, 10), actions);
  }

  return actionsByConfigurationId;
}
