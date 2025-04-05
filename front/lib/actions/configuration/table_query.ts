import _ from "lodash";
import { Op } from "sequelize";

import { renderTableConfiguration } from "@app/lib/actions/configuration/helpers";
import { DEFAULT_TABLES_QUERY_ACTION_NAME } from "@app/lib/actions/constants";
import type { TablesQueryConfigurationType } from "@app/lib/actions/tables_query";
import {
  AgentTablesQueryConfiguration,
  AgentTablesQueryConfigurationTable,
} from "@app/lib/models/assistant/actions/tables_query";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ModelId } from "@app/types";

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

export async function createTableDataSourceConfiguration(
  auth: Authenticator,
  t: Transaction,
  {
    tableConfigurations,
    tablesQueryConfig,
    mcpConfig,
  }: {
    tableConfigurations: TableDataSourceConfiguration[];
    tablesQueryConfig: AgentTablesQueryConfiguration | null;
    mcpConfig: AgentMCPServerConfiguration | null;
  }
) {
  const owner = auth.getNonNullableWorkspace();
  // Although we have the capability to support multiple workspaces,
  // currently, we only support one workspace, which is the one the user is in.
  // This allows us to use the current authenticator to fetch resources.
  assert(tableConfigurations.every((tc) => tc.workspaceId === owner.sId));

  // DataSourceViewResource.listByWorkspace() applies the permissions check.
  const dataSourceViews = await DataSourceViewResource.listByWorkspace(auth);
  const dataSourceViewsMap = dataSourceViews.reduce(
    (acc, dsv) => {
      acc[dsv.sId] = dsv;
      return acc;
    },
    {} as Record<string, DataSourceViewResource>
  );

  return Promise.all(
    tableConfigurations.map(async (tc) => {
      const dataSourceView = dataSourceViewsMap[tc.dataSourceViewId];
      assert(
        dataSourceView,
        "Can't create TableDataSourceConfiguration for query tables: DataSourceView not found."
      );

      const { dataSource } = dataSourceView;

      await AgentTablesQueryConfigurationTable.create(
        {
          dataSourceId: dataSource.id,
          dataSourceViewId: dataSourceView.id,
          tableId: tc.tableId,
          tablesQueryConfigurationId: tablesQueryConfig?.id || null,
          mcpServerConfigurationId: mcpConfig?.id || null,
          workspaceId: owner.id,
        },
        { transaction: t }
      );
    })
  );
}

export function getTableConfiguration(
  table: AgentTablesQueryConfigurationTable
): TableDataSourceConfiguration {
  const { dataSourceView } = table;

  return {
    sId: makeSId("table_configuration", {
      id: table.id,
      workspaceId: dataSourceView.workspaceId,
    }),
    dataSourceViewId: DataSourceViewResource.modelIdToSId({
      id: dataSourceView.id,
      workspaceId: dataSourceView.workspaceId,
    }),
    workspaceId: dataSourceView.workspace.sId,
    tableId: table.tableId,
  };
}
