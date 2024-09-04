import type {
  AgentActionConfigurationType,
  AgentConfigurationType,
  AppType,
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  DustAppRunConfigurationType,
  ProcessConfigurationType,
  RetrievalConfigurationType,
  TablesQueryConfigurationType,
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

import { getContentNodeInternalIdFromTableId } from "@app/components/assistant_builder/shared";
import type { AssistantBuilderActionConfiguration } from "@app/components/assistant_builder/types";
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

  const builderActions: AssistantBuilderActionConfiguration[] = [];

  for (const action of configuration.actions) {
    const builderAction = await initializeBuilderAction(
      action,
      dataSourceViews,
      dustApps,
      coreAPI
    );

    if (builderAction) {
      if (action.name) {
        builderAction.name = action.name;
      }
      if (action.description) {
        builderAction.description = action.description;
      }

      builderActions.push(builderAction);
    }
  }

  return builderActions;
}

async function initializeBuilderAction(
  action: AgentActionConfigurationType,
  dataSourceViews: DataSourceViewType[],
  dustApps: AppType[],
  coreAPI: CoreAPI
): Promise<AssistantBuilderActionConfiguration | null> {
  if (isRetrievalConfiguration(action)) {
    return getRetrievalActionConfiguration(action, dataSourceViews);
  } else if (isDustAppRunConfiguration(action)) {
    return getDustAppRunActionConfiguration(action, dustApps);
  } else if (isTablesQueryConfiguration(action)) {
    return getTablesQueryActionConfiguration(action, dataSourceViews, coreAPI);
  } else if (isProcessConfiguration(action)) {
    return getProcessActionConfiguration(action, dataSourceViews);
  } else if (isWebsearchConfiguration(action)) {
    return getDefaultWebsearchActionConfiguration();
  } else if (isBrowseConfiguration(action)) {
    return null; // Ignore browse actions
  } else {
    assertNever(action);
  }
}

async function getRetrievalActionConfiguration(
  action: RetrievalConfigurationType,
  dataSourceViews: DataSourceViewType[]
): Promise<AssistantBuilderActionConfiguration> {
  const retrievalConfiguration =
    action.query !== "none"
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
    await renderDataSourcesConfigurations(action, dataSourceViews);

  return retrievalConfiguration;
}

async function getDustAppRunActionConfiguration(
  action: DustAppRunConfigurationType,
  dustApps: AppType[]
): Promise<AssistantBuilderActionConfiguration> {
  const dustAppConfiguration = getDefaultDustAppRunActionConfiguration();
  const app = dustApps.find((app) => app.sId === action.appId);

  if (app) {
    dustAppConfiguration.configuration.app = app;
    dustAppConfiguration.name = slugify(app.name);
    dustAppConfiguration.description = app.description ?? "";
  }

  return dustAppConfiguration;
}

async function getTablesQueryActionConfiguration(
  action: TablesQueryConfigurationType,
  dataSourceViews: DataSourceViewType[],
  coreAPI: CoreAPI
): Promise<AssistantBuilderActionConfiguration> {
  const tablesQueryConfiguration = getDefaultTablesQueryActionConfiguration();
  tablesQueryConfiguration.configuration =
    await renderTableDataSourcesConfigurations(
      action,
      dataSourceViews,
      coreAPI
    );

  return tablesQueryConfiguration;
}

async function getProcessActionConfiguration(
  action: ProcessConfigurationType,
  dataSourceViews: DataSourceViewType[]
): Promise<AssistantBuilderActionConfiguration> {
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
    await renderDataSourcesConfigurations(action, dataSourceViews);
  processConfiguration.configuration.schema = action.schema;

  return processConfiguration;
}

async function renderDataSourcesConfigurations(
  action: RetrievalConfigurationType | ProcessConfigurationType,
  dataSourceViews: DataSourceViewType[]
): Promise<DataSourceViewSelectionConfigurations> {
  const selectedResources = action.dataSources.map((ds) => ({
    dataSourceViewId: ds.dataSourceViewId,
    resources: ds.filter.parents?.in ?? null,
    isSelectAll: !ds.filter.parents,
  }));

  const dataSourceConfigurationsArray = await Promise.all(
    selectedResources.map(async (sr) => {
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
    })
  );

  return dataSourceConfigurationsArray.reduce(
    (acc, curr) => ({
      ...acc,
      [curr.dataSourceView.sId]: curr,
    }),
    {} as DataSourceViewSelectionConfigurations
  );
}

async function renderTableDataSourcesConfigurations(
  action: TablesQueryConfigurationType,
  dataSourceViews: DataSourceViewType[],
  coreAPI: CoreAPI
): Promise<DataSourceViewSelectionConfigurations> {
  const selectedResources = action.tables.map((table) => ({
    dataSourceViewId: table.dataSourceViewId,
    resources: [table.tableId],
    // `isSelectAll` is always false for TablesQueryConfiguration.
    isSelectAll: false,
  }));

  const dataSourceConfigurationsArray: DataSourceViewSelectionConfiguration[] =
    await Promise.all(
      selectedResources.map(async (sr) => {
        const dataSourceView = dataSourceViews.find(
          (dsv) => dsv.sId === sr.dataSourceViewId
        );
        if (!dataSourceView) {
          throw new Error(
            `Could not find DataSourceView with id ${sr.dataSourceViewId}`
          );
        }

        const coreAPITables = await Promise.all(
          sr.resources.map(async (tableId) => {
            const coreAPITable = await coreAPI.getTable({
              projectId: dataSourceView.dataSource.dustAPIProjectId,
              dataSourceId: dataSourceView.dataSource.dustAPIDataSourceId,
              tableId,
            });

            if (coreAPITable.isErr()) {
              throw coreAPITable.error;
            }
            return coreAPITable.value.table;
          })
        );

        return {
          dataSourceView,
          selectedResources: coreAPITables.map((table) => ({
            dustDocumentId: table.table_id,
            expandable: false,
            internalId: getContentNodeInternalIdFromTableId(
              dataSourceView,
              table
            ),
            lastUpdatedAt: table.timestamp,
            parentInternalId: null,
            parentInternalIds: [],
            permission: "read",
            preventSelection: false,
            sourceUrl: null,
            title: table.name,
            type: "database",
          })),
          isSelectAll: sr.isSelectAll,
        };
      })
    );

  // Return a map of dataSourceView.sId to selected resources.
  return dataSourceConfigurationsArray.reduce(
    (acc, curr) => ({
      ...acc,
      [curr.dataSourceView.sId]: {
        ...curr,
        selectedResources: [
          // Merge selected resources within the same dataSourceView.
          ...(acc[curr.dataSourceView.sId]?.selectedResources ?? []),
          ...curr.selectedResources,
        ],
      },
    }),
    {} as DataSourceViewSelectionConfigurations
  );
}
