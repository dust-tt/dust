import type {
  ModelId,
  TableDataSourceConfiguration,
  TablesQueryConfigurationType,
} from "@dust-tt/types";
import assert from "assert";
import _ from "lodash";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

import { DEFAULT_TABLES_QUERY_ACTION_NAME } from "@app/lib/api/assistant/actions/names";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentTablesQueryConfiguration,
  AgentTablesQueryConfigurationTable,
} from "@app/lib/models/assistant/actions/tables_query";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { VaultResource } from "@app/lib/resources/vault_resource";

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

          const dataSourceViewId = DataSourceViewResource.modelIdToSId({
            id: dataSourceView.id,
            workspaceId: dataSourceView.workspaceId,
          });

          return {
            dataSourceId: table.dataSourceId,
            dataSourceViewId,
            workspaceId: table.dataSourceWorkspaceId,
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

  const dataSourceIds = tableConfigurations.map((tc) => tc.dataSourceId);
  const [globalVault, dataSources] = await Promise.all([
    // TODO(GROUPS_INFRA): Remove fetching global vault once the UI passes the data source view.
    VaultResource.fetchWorkspaceGlobalVault(auth),
    // TODO(DATASOURCE_SID): remove fetch by names in favor of fetchByModelIds once the
    // configuration is migrated to it.
    DataSourceResource.fetchByNames(
      // We can use `auth` because we limit to one workspace.
      auth,
      dataSourceIds
    ),
  ]);

  const uniqueDataSources = _.uniqBy(dataSources, (ds) => ds.id);

  const dataSourceViews =
    await DataSourceViewResource.listForDataSourcesInVault(
      // We can use `auth` because we limit to one workspace.
      auth,
      uniqueDataSources,
      globalVault
    );

  return Promise.all(
    tableConfigurations.map(async (tc) => {
      const dataSource = dataSources.find((ds) => ds.name === tc.dataSourceId);
      assert(
        dataSource,
        "Can't create TableDataSourceConfiguration for query tables: DataSource not found."
      );

      let dataSourceView;

      // Since the UI does not currently provide the data source view,
      // we try to retrieve the view associated with the data from the global vault
      // and assign it to the table data source configuration.
      if (!tc.dataSourceViewId) {
        dataSourceView = dataSourceViews.find(
          (dsv) => dsv.dataSourceId === dataSource.id
        );
      } else {
        dataSourceView = dataSourceViews.find(
          (dsv) => dsv.sId === tc.dataSourceViewId
        );
      }

      assert(
        dataSourceView,
        "Can't create TableDataSourceConfiguration for query tables: DataSourceView not found."
      );
      assert(
        dataSourceView.dataSource.name === tc.dataSourceId,
        "Can't create TableDataSourceConfiguration for query tables: data source view does not belong to the data source."
      );

      await AgentTablesQueryConfigurationTable.create(
        {
          // TODO(GROUPS_INFRA) Use ModelId for dataSourceId.
          dataSourceId: dataSource.name,
          dataSourceViewId: dataSourceView.id,
          dataSourceWorkspaceId: tc.workspaceId,
          tableId: tc.tableId,
          tablesQueryConfigurationId: tablesQueryConfig.id,
        },
        { transaction: t }
      );
    })
  );
}
