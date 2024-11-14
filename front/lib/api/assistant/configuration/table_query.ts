import type {
  ModelId,
  TableDataSourceConfiguration,
  TablesQueryConfigurationType,
} from "@dust-tt/types";
import assert from "assert";
import _ from "lodash";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

import { DEFAULT_TABLES_QUERY_ACTION_NAME } from "@app/lib/api/assistant/actions/constants";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentTablesQueryConfiguration,
  AgentTablesQueryConfigurationTable,
} from "@app/lib/models/assistant/actions/tables_query";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";

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

      const tables: TableDataSourceConfiguration[] =
        tablesQueryConfigTables.map((table) => {
          const { dataSourceView } = table;

          return {
            dataSourceViewId: DataSourceViewResource.modelIdToSId({
              id: dataSourceView.id,
              workspaceId: dataSourceView.workspaceId,
            }),
            workspaceId: dataSourceView.workspace.sId,
            tableId: table.tableId,
          };
        });

      actions.push({
        id: c.id,
        sId: c.sId,
        type: "tables_query_configuration",
        tables,
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
  tableConfigurations: TableDataSourceConfiguration[],
  tablesQueryConfig: AgentTablesQueryConfiguration,
  t: Transaction
) {
  // Although we have the capability to support multiple workspaces,
  // currently, we only support one workspace, which is the one the user is in.
  // This allows us to use the current authenticator to fetch resources.
  assert(
    tableConfigurations.every(
      (tc) => tc.workspaceId === auth.getNonNullableWorkspace().sId
    )
  );

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
          tablesQueryConfigurationId: tablesQueryConfig.id,
        },
        { transaction: t }
      );
    })
  );
}
