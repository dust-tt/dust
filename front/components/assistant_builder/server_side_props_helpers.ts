import type {
  AgentConfigurationType,
  AppType,
  CoreAPITable,
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  ProcessConfigurationType,
  RetrievalConfigurationType,
  TemplateAgentConfigurationType,
} from "@dust-tt/types";
import {
  assertNever,
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
import { getApps } from "@app/lib/api/app";
import config from "@app/lib/api/config";
import { getContentNodesForManagedDataSourceView } from "@app/lib/api/data_source_view";
import type { Authenticator } from "@app/lib/auth";
import { tableKey } from "@app/lib/client/tables_query";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import logger from "@app/logger/logger";

export const getAccessibleSourcesAndApps = async (auth: Authenticator) => {
  const accessibleVaults = [
    await VaultResource.fetchWorkspaceGlobalVault(auth),
  ];

  const [dsViews, allDustApps] = await Promise.all([
    DataSourceViewResource.listByVaults(auth, accessibleVaults),
    getApps(auth),
  ]);

  return {
    dataSourceViews: dsViews.map((dsView) => dsView.toJSON()),
    dustApps: allDustApps,
  };
};

export async function buildInitialActions({
  dataSourceViews,
  dustApps,
  configuration,
}: {
  dataSourceViews: DataSourceViewType[];
  dustApps: AppType[];
  configuration: AgentConfigurationType | TemplateAgentConfigurationType;
}): Promise<AssistantBuilderActionConfiguration[]> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  // Helper function to compute DataSourceViewSelectionConfigurations
  const renderDataSourcesConfigurations = async (
    action: RetrievalConfigurationType | ProcessConfigurationType
  ) => {
    const selectedResources: {
      dataSourceViewId: string;
      resources: string[] | null;
      isSelectAll: boolean;
    }[] = [];

    for (const ds of action.dataSources) {
      selectedResources.push({
        dataSourceViewId: ds.dataSourceViewId,
        resources: ds.filter.parents?.in ?? null,
        isSelectAll: !ds.filter.parents,
      });
    }

    const dataSourceConfigurationsArray: DataSourceViewSelectionConfiguration[] =
      await Promise.all(
        selectedResources.map(
          async (sr): Promise<DataSourceViewSelectionConfiguration> => {
            const dataSourceView = dataSourceViews.find(
              (dsv) => dsv.sId === sr.dataSourceViewId
            );

            if (!dataSourceView) {
              throw new Error(
                `Could not find DataSourceView with id ${sr.dataSourceViewId}`
              );
            }

            if (!dataSourceView.dataSource.connectorId || !sr.resources) {
              return {
                dataSourceView,
                selectedResources: [],
                isSelectAll: sr.isSelectAll,
              };
            }

            const nodesRes = await getContentNodesForManagedDataSourceView(
              dataSourceView,
              {
                includeChildren: false,
                internalIds: sr.resources,
                viewType: "documents",
              }
            );

            if (nodesRes.isErr()) {
              throw nodesRes.error;
            }

            return {
              dataSourceView,
              selectedResources: nodesRes.value,
              isSelectAll: sr.isSelectAll,
            };
          }
        )
      );

    // key: dataSourceView.sId, value: DataSourceConfig
    const dataSourceConfigurations = dataSourceConfigurationsArray.reduce(
      (acc, curr) => ({
        ...acc,
        [curr.dataSourceView.sId]: curr,
      }),
      {} as DataSourceViewSelectionConfigurations
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
          const dataSourceView = dataSourceViews.find(
            (dsv) => dsv.dataSource.sId === t.dataSourceId
          );

          if (!dataSourceView) {
            throw new Error(
              `Could not find DataSourceView with id ${t.dataSourceId}`
            );
          }

          const coreAPITable = await coreAPI.getTable({
            projectId: dataSourceView.dataSource.dustAPIProjectId,
            dataSourceName: dataSourceView.dataSource.name,
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
