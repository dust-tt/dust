import type {
  AgentConfigurationType,
  AppType,
  CoreAPITable,
  DataSourceType,
  ProcessConfigurationType,
  RetrievalConfigurationType,
  TemplateAgentConfigurationType,
} from "@dust-tt/types";
import {
  assertNever,
  ConnectorsAPI,
  CoreAPI,
  isDustAppRunConfiguration,
  isProcessConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
} from "@dust-tt/types";

import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderDataSourceConfiguration,
  AssistantBuilderTablesQueryConfiguration,
} from "@app/components/assistant_builder/types";
import {
  getDefaultDustAppRunActionConfiguration,
  getDefaultProcessActionConfiguration,
  getDefaultRetrievalExhaustiveActionConfiguration,
  getDefaultRetrievalSearchActionConfiguration,
  getDefaultTablesQueryActionConfiguration,
} from "@app/components/assistant_builder/types";
import { tableKey } from "@app/lib/client/tables_query";
import { deprecatedGetFirstActionConfiguration } from "@app/lib/deprecated_action_configurations";
import logger from "@app/logger/logger";

export async function buildInitialActions({
  dataSourcesByName,
  dustApps,
  configuration,
}: {
  dataSourcesByName: Record<string, DataSourceType>;
  dustApps: AppType[];
  configuration: AgentConfigurationType | TemplateAgentConfigurationType;
}): Promise<AssistantBuilderActionConfiguration[]> {
  const coreAPI = new CoreAPI(logger);

  // Helper function to compute AssistantBuilderDataSourceConfigurations
  const renderDataSourcesConfigurations = async (
    action: RetrievalConfigurationType | ProcessConfigurationType
  ) => {
    const selectedResources: {
      dataSourceName: string;
      resources: string[] | null;
      isSelectAll: boolean;
    }[] = [];

    for (const ds of action.dataSources) {
      selectedResources.push({
        dataSourceName: ds.dataSourceId,
        resources: ds.filter.parents?.in ?? null,
        isSelectAll: !ds.filter.parents,
      });
    }

    const dataSourceConfigurationsArray: AssistantBuilderDataSourceConfiguration[] =
      await Promise.all(
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

    return dataSourceConfigurations;
  };

  const action = deprecatedGetFirstActionConfiguration(configuration);

  if (!action) {
    return [];
  } else if (isRetrievalConfiguration(action)) {
    const isSearch = action.query !== "none";

    const retrievalConfiguration = isSearch
      ? getDefaultRetrievalSearchActionConfiguration()
      : getDefaultRetrievalExhaustiveActionConfiguration();

    if (
      action.relativeTimeFrame !== "auto" &&
      action.relativeTimeFrame !== "none"
    ) {
      retrievalConfiguration.configuration.timeFrame = {
        value: action.relativeTimeFrame.duration,
        unit: action.relativeTimeFrame.unit,
      };
    }

    retrievalConfiguration.configuration.dataSourceConfigurations =
      await renderDataSourcesConfigurations(action);

    return [retrievalConfiguration];
  } else if (isDustAppRunConfiguration(action)) {
    const dustAppConfiguration = getDefaultDustAppRunActionConfiguration();
    for (const app of dustApps) {
      if (app.sId === action.appId) {
        dustAppConfiguration.configuration.app = app;
        break;
      }
    }
    return [dustAppConfiguration];
  } else if (isTablesQueryConfiguration(action)) {
    const tablesQueryConfiguration = getDefaultTablesQueryActionConfiguration();

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

    tablesQueryConfiguration.configuration = action.tables.reduce(
      (acc, curr, i) => {
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
      },
      {} as AssistantBuilderTablesQueryConfiguration
    );

    return [tablesQueryConfiguration];
  } else if (isProcessConfiguration(action)) {
    const processConfiguration = getDefaultProcessActionConfiguration();
    if (
      action.relativeTimeFrame !== "auto" &&
      action.relativeTimeFrame !== "none"
    ) {
      processConfiguration.configuration.timeFrame = {
        value: action.relativeTimeFrame.duration,
        unit: action.relativeTimeFrame.unit,
      };
    }

    processConfiguration.configuration.tagsFilter = action.tagsFilter;

    processConfiguration.configuration.dataSourceConfigurations =
      await renderDataSourcesConfigurations(action);

    processConfiguration.configuration.schema = action.schema;

    return [processConfiguration];
  } else {
    assertNever(action);
  }
}
