import type {
  AgentConfigurationType,
  AppType,
  CoreAPITable,
  DataSourceType,
} from "@dust-tt/types";
import {
  ConnectorsAPI,
  CoreAPI,
  isDustAppRunConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
} from "@dust-tt/types";

import type {
  AssistantBuilderDataSourceConfiguration,
  AssistantBuilderInitialState,
} from "@app/components/assistant_builder/types";
import { tableKey } from "@app/lib/client/tables_query";
import logger from "@app/logger/logger";

export async function buildInitialState({
  dataSourceByName,
  config,
  dustApps,
}: {
  dataSourceByName: Record<string, DataSourceType>;
  config: AgentConfigurationType;
  dustApps: AppType[];
}) {
  const coreAPI = new CoreAPI(logger);

  const selectedResources: {
    dataSourceName: string;
    resources: string[] | null;
    isSelectAll: boolean;
  }[] = [];

  if (isRetrievalConfiguration(config.action)) {
    for (const ds of config.action.dataSources) {
      selectedResources.push({
        dataSourceName: ds.dataSourceId,
        resources: ds.filter.parents?.in ?? null,
        isSelectAll: !ds.filter.parents,
      });
    }
  }

  const dataSourceConfigurationsArray: NonNullable<
    AssistantBuilderInitialState["dataSourceConfigurations"]
  >[string][] = await Promise.all(
    selectedResources.map(
      async (ds): Promise<AssistantBuilderDataSourceConfiguration> => {
        const dataSource = dataSourceByName[ds.dataSourceName];
        if (!dataSource.connectorId || !ds.resources) {
          return {
            dataSource: dataSource,
            selectedResources: [],
            isSelectAll: ds.isSelectAll,
          };
        }
        const connectorsAPI = new ConnectorsAPI(logger);
        const response = await connectorsAPI.getContentNodes({
          connectorId: dataSource.connectorId,
          internalIds: ds.resources,
        });

        if (response.isErr()) {
          throw response.error;
        }

        return {
          dataSource: dataSource,
          selectedResources: response.value.nodes,
          isSelectAll: ds.isSelectAll,
        };
      }
    )
  );

  // key: dataSourceName, value: DataSourceConfig
  const dataSourceConfigurations = dataSourceConfigurationsArray.reduce(
    (acc, curr) => ({ ...acc, [curr.dataSource.name]: curr }),
    {} as Record<string, AssistantBuilderDataSourceConfiguration>
  );

  let dustAppConfiguration: AssistantBuilderInitialState["dustAppConfiguration"] =
    null;

  if (isDustAppRunConfiguration(config.action)) {
    for (const app of dustApps) {
      if (app.sId === config.action.appId) {
        dustAppConfiguration = {
          app,
        };
        break;
      }
    }
  }

  let tablesQueryConfiguration: AssistantBuilderInitialState["tablesQueryConfiguration"] =
    {};

  if (
    isTablesQueryConfiguration(config.action) &&
    config.action.tables.length
  ) {
    const coreAPITables: CoreAPITable[] = await Promise.all(
      config.action.tables.map(async (t) => {
        const dataSource = dataSourceByName[t.dataSourceId];
        const coreAPITable = await coreAPI.getTable({
          projectId: dataSource.dustAPIProjectId,
          dataSourceName: dataSource.name,
          tableId: t.tableId,
        });

        if (coreAPITable.isErr()) {
          throw coreAPITable.error;
        }

        return coreAPITable.value.table;
      })
    );

    tablesQueryConfiguration = config.action.tables.reduce((acc, curr, i) => {
      const table = coreAPITables[i];
      const key = tableKey(curr);
      return {
        ...acc,
        [key]: {
          workspaceId: curr.workspaceId,
          dataSourceId: curr.dataSourceId,
          tableId: curr.tableId,
          tableName: `${table.name}`,
        },
      };
    }, {} as AssistantBuilderInitialState["tablesQueryConfiguration"]);
  }

  return {
    dataSourceConfigurations,
    dustAppConfiguration,
    tablesQueryConfiguration,
  };
}
