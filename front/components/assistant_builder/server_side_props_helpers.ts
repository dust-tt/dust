import type {
  AgentConfigurationType,
  AppType,
  CoreAPITable,
  ProcessConfigurationType,
  RetrievalConfigurationType,
  TemplateAgentConfigurationType,
} from "@dust-tt/types";
import {
  assertNever,
  ConnectorsAPI,
  CoreAPI,
  isBrowseConfiguration,
  isDustAppRunConfiguration,
  isProcessConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  isWebsearchConfiguration,
  slugify,
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
  getDefaultWebsearchActionConfiguration,
} from "@app/components/assistant_builder/types";
import config from "@app/lib/api/config";
import { tableKey } from "@app/lib/client/tables_query";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";

export async function buildInitialActions({
  dataSourcesByName,
  dustApps,
  configuration,
}: {
  dataSourcesByName: Record<string, DataSourceResource>;
  dustApps: AppType[];
  configuration: AgentConfigurationType | TemplateAgentConfigurationType;
}): Promise<AssistantBuilderActionConfiguration[]> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  // Helper function to compute AssistantBuilderDataSourceConfigurations
  const renderDataSourcesConfigurations = async (
    action: RetrievalConfigurationType | ProcessConfigurationType
  ) => {
    const selectedResources: {
      dataSourceId: string;
      dataSourceViewId: string | null;
      resources: string[] | null;
      isSelectAll: boolean;
    }[] = [];

    for (const ds of action.dataSources) {
      selectedResources.push({
        dataSourceId: ds.dataSourceId,
        dataSourceViewId: ds.dataSourceViewId,
        resources: ds.filter.parents?.in ?? null,
        isSelectAll: !ds.filter.parents,
      });
    }

    const dataSourceConfigurationsArray: AssistantBuilderDataSourceConfiguration[] =
      await Promise.all(
        selectedResources.map(
          async (sr): Promise<AssistantBuilderDataSourceConfiguration> => {
            const dataSourceResource = dataSourcesByName[sr.dataSourceId];

            if (!dataSourceResource.connectorId || !sr.resources) {
              return {
                dataSource: dataSourceResource.toJSON(),
                dataSourceView: null,
                selectedResources: [],
                isSelectAll: sr.isSelectAll,
              };
            }
            const connectorsAPI = new ConnectorsAPI(
              config.getConnectorsAPIConfig(),
              logger
            );
            const response = await connectorsAPI.getContentNodes({
              connectorId: dataSourceResource.connectorId,
              internalIds: sr.resources,
            });

            if (response.isErr()) {
              throw response.error;
            }

            return {
              dataSource: dataSourceResource.toJSON(),
              dataSourceView: null,
              selectedResources: response.value.nodes,
              isSelectAll: sr.isSelectAll,
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

  const actions = configuration.actions;

  const builderActions: AssistantBuilderActionConfiguration[] = [];

  for (const action of actions) {
    let builderAction: AssistantBuilderActionConfiguration | null = null;
    if (isRetrievalConfiguration(action)) {
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

      builderAction = retrievalConfiguration;
    } else if (isDustAppRunConfiguration(action)) {
      const dustAppConfiguration = getDefaultDustAppRunActionConfiguration();
      for (const app of dustApps) {
        if (app.sId === action.appId) {
          dustAppConfiguration.configuration.app = app;
          dustAppConfiguration.name = slugify(app.name);
          dustAppConfiguration.description = app.description ?? "";
          break;
        }
      }

      builderAction = dustAppConfiguration;
    } else if (isTablesQueryConfiguration(action)) {
      const tablesQueryConfiguration =
        getDefaultTablesQueryActionConfiguration();

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

      builderAction = tablesQueryConfiguration;
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

      builderAction = processConfiguration;
    } else if (isWebsearchConfiguration(action)) {
      builderAction = getDefaultWebsearchActionConfiguration();
      // Websearch: use the default name/description
      builderActions.push(builderAction);
      continue;
    } else if (isBrowseConfiguration(action)) {
      // Ignore browse actions
      continue;
    } else {
      assertNever(action);
    }

    if (action.name) {
      builderAction.name = action.name;
    }
    if (action.description) {
      builderAction.description = action.description;
    }

    builderActions.push(builderAction);
  }

  return builderActions;
}
