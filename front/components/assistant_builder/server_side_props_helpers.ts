import type {
  AgentActionConfigurationType,
  AgentConfigurationType,
  AppType,
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
  DustAppRunConfigurationType,
  ProcessConfigurationType,
  RetrievalConfigurationType,
  TablesQueryConfigurationType,
  TemplateAgentConfigurationType,
} from "@dust-tt/types";
import {
  assertNever,
  isBrowseConfiguration,
  isDustAppRunConfiguration,
  isProcessConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  isWebsearchConfiguration,
  slugify,
} from "@dust-tt/types";

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
import { getContentNodesForDataSourceView } from "@app/lib/api/data_source_view";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getAccessibleSourcesAndApps = async (auth: Authenticator) => {
  const accessibleVaults = [
    ...(await VaultResource.listWorkspaceVaults(auth)),
  ].filter((vault) => !vault.isSystem());

  const [dsViews, allDustApps] = await Promise.all([
    DataSourceViewResource.listByVaults(auth, accessibleVaults),
    getApps(auth),
  ]);

  return {
    vaults: accessibleVaults,
    dataSourceViews: dsViews,
    dustApps: allDustApps,
  };
};

export async function buildInitialActions({
  dataSourceViews,
  dustApps,
  configuration,
}: {
  dataSourceViews: DataSourceViewResource[];
  dustApps: AppType[];
  configuration: AgentConfigurationType | TemplateAgentConfigurationType;
}): Promise<AssistantBuilderActionConfiguration[]> {
  const builderActions: AssistantBuilderActionConfiguration[] = [];

  for (const action of configuration.actions) {
    const builderAction = await initializeBuilderAction(
      action,
      dataSourceViews,
      dustApps
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
  dataSourceViews: DataSourceViewResource[],
  dustApps: AppType[]
): Promise<AssistantBuilderActionConfiguration | null> {
  if (isRetrievalConfiguration(action)) {
    return getRetrievalActionConfiguration(action, dataSourceViews);
  } else if (isDustAppRunConfiguration(action)) {
    return getDustAppRunActionConfiguration(action, dustApps);
  } else if (isTablesQueryConfiguration(action)) {
    return getTablesQueryActionConfiguration(action, dataSourceViews);
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
  dataSourceViews: DataSourceViewResource[]
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
  dataSourceViews: DataSourceViewResource[]
): Promise<AssistantBuilderActionConfiguration> {
  const tablesQueryConfiguration = getDefaultTablesQueryActionConfiguration();
  tablesQueryConfiguration.configuration =
    await renderTableDataSourcesConfigurations(action, dataSourceViews);

  return tablesQueryConfiguration;
}

async function getProcessActionConfiguration(
  action: ProcessConfigurationType,
  dataSourceViews: DataSourceViewResource[]
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
  dataSourceViews: DataSourceViewResource[]
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

      const serializedDataSourceView = dataSourceView.toJSON();

      if (!dataSourceView.dataSource.connectorId || !sr.resources) {
        return {
          dataSourceView: serializedDataSourceView,
          selectedResources: [],
          isSelectAll: sr.isSelectAll,
        };
      }

      const contentNodesRes = await getContentNodesForDataSourceView(
        dataSourceView,
        {
          includeChildren: false,
          internalIds: sr.resources,
          viewType: "documents",
        }
      );

      if (contentNodesRes.isErr()) {
        throw contentNodesRes.error;
      }

      return {
        dataSourceView: serializedDataSourceView,
        selectedResources: contentNodesRes.value.nodes,
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
  dataSourceViews: DataSourceViewResource[]
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

        const serializedDataSourceView = dataSourceView.toJSON();

        const contentNodesRes = await getContentNodesForDataSourceView(
          dataSourceView,
          {
            includeChildren: false,
            internalIds: sr.resources,
            // We only want to fetch tables from the core API.
            onlyCoreAPI: true,
            viewType: "tables",
          }
        );

        if (contentNodesRes.isErr()) {
          throw contentNodesRes.error;
        }

        return {
          dataSourceView: serializedDataSourceView,
          selectedResources: contentNodesRes.value.nodes,
          isSelectAll: sr.isSelectAll,
        };
      })
    );

  // Return a map of dataSourceView.sId to selected resources.
  return dataSourceConfigurationsArray.reduce<DataSourceViewSelectionConfigurations>(
    (acc, config) => {
      const { sId } = config.dataSourceView;

      if (!acc[sId]) {
        // Initialize the entry if it doesn't exist.
        acc[sId] = config;
      } else {
        // Append to selectedResources if entry already exists.
        acc[sId].selectedResources.push(...config.selectedResources);
      }

      return acc;
    },
    {}
  );
}
