import type {
  AgentConfigurationType,
  AppType,
  CoreAPITable,
  DataSourceType,
  TemplateAgentConfigurationType,
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
import { DEFAULT_ASSISTANT_STATE } from "@app/components/assistant_builder/types";
import { tableKey } from "@app/lib/client/tables_query";
import { deprecatedGetFirstActionConfiguration } from "@app/lib/deprecated_action_configurations";
import logger from "@app/logger/logger";

export async function buildInitialState({
  dataSourcesByName,
  dustApps,
  configuration,
}: {
  dataSourcesByName: Record<string, DataSourceType>;
  dustApps: AppType[];
  configuration: AgentConfigurationType | TemplateAgentConfigurationType;
}) {
  const coreAPI = new CoreAPI(logger);

  const selectedResources: {
    dataSourceName: string;
    resources: string[] | null;
    isSelectAll: boolean;
  }[] = [];

  const action = deprecatedGetFirstActionConfiguration(configuration);

  const retrievalConfiguration = DEFAULT_ASSISTANT_STATE.retrievalConfiguration;

  if (isRetrievalConfiguration(action)) {
    if (
      action.relativeTimeFrame !== "auto" &&
      action.relativeTimeFrame !== "none"
    ) {
      retrievalConfiguration.timeFrame = {
        value: action.relativeTimeFrame.duration,
        unit: action.relativeTimeFrame.unit,
      };
    }

    for (const ds of action.dataSources) {
      selectedResources.push({
        dataSourceName: ds.dataSourceId,
        resources: ds.filter.parents?.in ?? null,
        isSelectAll: !ds.filter.parents,
      });
    }

    const dataSourceConfigurationsArray: NonNullable<
      AssistantBuilderInitialState["retrievalConfiguration"]["dataSourceConfigurations"]
    >[string][] = await Promise.all(
      selectedResources.map(
        async (ds): Promise<AssistantBuilderDataSourceConfiguration> => {
          const dataSource = dataSourcesByName[ds.dataSourceName];
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

    retrievalConfiguration.dataSourceConfigurations = dataSourceConfigurations;
  }

  const dustAppConfiguration = DEFAULT_ASSISTANT_STATE.dustAppConfiguration;

  if (isDustAppRunConfiguration(action)) {
    for (const app of dustApps) {
      if (app.sId === action.appId) {
        dustAppConfiguration.app = app;
        break;
      }
    }
  }

  let tablesQueryConfiguration =
    DEFAULT_ASSISTANT_STATE.tablesQueryConfiguration;

  if (isTablesQueryConfiguration(action) && action.tables.length) {
    const coreAPITables: CoreAPITable[] = await Promise.all(
      action.tables.map(async (t) => {
        const dataSource = dataSourcesByName[t.dataSourceId];
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

    tablesQueryConfiguration = action.tables.reduce((acc, curr, i) => {
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
    retrievalConfiguration,
    dustAppConfiguration,
    tablesQueryConfiguration,
  };
}
