import assert from "assert";

import type { AssistantBuilderActionConfiguration } from "@app/components/assistant_builder/types";
import {
  getDefaultDustAppRunActionConfiguration,
  getDefaultMCPServerActionConfiguration,
  getDefaultProcessActionConfiguration,
  getDefaultReasoningActionConfiguration,
  getDefaultRetrievalExhaustiveActionConfiguration,
  getDefaultRetrievalSearchActionConfiguration,
  getDefaultTablesQueryActionConfiguration,
  getDefaultWebsearchActionConfiguration,
} from "@app/components/assistant_builder/types";
import { REASONING_MODEL_CONFIGS } from "@app/components/providers/types";
import type { DustAppRunConfigurationType } from "@app/lib/actions/dust_app_run";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { ProcessConfigurationType } from "@app/lib/actions/process";
import type { ReasoningConfigurationType } from "@app/lib/actions/reasoning";
import type {
  DataSourceConfiguration,
  RetrievalConfigurationType,
} from "@app/lib/actions/retrieval";
import type {
  TableDataSourceConfiguration,
  TablesQueryConfigurationType,
} from "@app/lib/actions/tables_query";
import type { AgentActionConfigurationType } from "@app/lib/actions/types/agent";
import {
  isBrowseConfiguration,
  isDustAppRunConfiguration,
  isMCPServerConfiguration,
  isPlatformMCPServerConfiguration,
  isProcessConfiguration,
  isReasoningConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  isWebsearchConfiguration,
} from "@app/lib/actions/types/guards";
import { getContentNodesForDataSourceView } from "@app/lib/api/data_source_view";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
  TemplateAgentConfigurationType,
} from "@app/types";
import { assertNever, slugify } from "@app/types";

export const getAccessibleSourcesAndApps = async (auth: Authenticator) => {
  const accessibleSpaces = (
    await SpaceResource.listWorkspaceSpaces(auth)
  ).filter((space) => !space.isSystem() && space.canRead(auth));

  const [dsViews, allDustApps, allMCPServerViews] = await Promise.all([
    DataSourceViewResource.listBySpaces(auth, accessibleSpaces, {
      includeEditedBy: true,
    }),
    AppResource.listByWorkspace(auth),
    MCPServerViewResource.listBySpaces(auth, accessibleSpaces),
  ]);

  return {
    spaces: accessibleSpaces,
    dataSourceViews: dsViews,
    dustApps: allDustApps,
    mcpServerViews: allMCPServerViews,
  };
};

export async function buildInitialActions({
  dataSourceViews,
  dustApps,
  configuration,
}: {
  dataSourceViews: DataSourceViewResource[];
  dustApps: AppResource[];
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
  dustApps: AppResource[]
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
  } else if (isReasoningConfiguration(action)) {
    return getReasoningActionConfiguration(action);
  } else if (isMCPServerConfiguration(action)) {
    return getMCPServerActionConfiguration(action, dataSourceViews);
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
    "timeFrame" in retrievalConfiguration.configuration &&
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
  dustApps: AppResource[]
): Promise<AssistantBuilderActionConfiguration> {
  const dustAppConfiguration = getDefaultDustAppRunActionConfiguration();
  const app = dustApps.find((app) => app.sId === action.appId);

  if (app) {
    dustAppConfiguration.configuration.app = app.toJSON();
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

  processConfiguration.configuration.dataSourceConfigurations =
    await renderDataSourcesConfigurations(action, dataSourceViews);
  processConfiguration.configuration.jsonSchema = action.jsonSchema;

  return processConfiguration;
}

function getReasoningActionConfiguration(
  action: ReasoningConfigurationType
): AssistantBuilderActionConfiguration {
  const builderAction = getDefaultReasoningActionConfiguration();
  if (builderAction.type !== "REASONING") {
    throw new Error("Reasoning action configuration is not valid");
  }

  const supportedReasoningModel = REASONING_MODEL_CONFIGS.find(
    (m) =>
      m.modelId === action.modelId &&
      m.providerId === action.providerId &&
      (m.reasoningEffort ?? null) === (action.reasoningEffort ?? null)
  );

  if (supportedReasoningModel) {
    builderAction.configuration.modelId = supportedReasoningModel.modelId;
    builderAction.configuration.providerId = supportedReasoningModel.providerId;
    builderAction.configuration.reasoningEffort =
      supportedReasoningModel.reasoningEffort ?? null;
  }

  return builderAction;
}

async function getMCPServerActionConfiguration(
  action: MCPServerConfigurationType,
  dataSourceViews: DataSourceViewResource[]
): Promise<AssistantBuilderActionConfiguration> {
  assert(isPlatformMCPServerConfiguration(action));

  const builderAction = getDefaultMCPServerActionConfiguration();
  if (builderAction.type !== "MCP") {
    throw new Error("MCP action configuration is not valid");
  }

  builderAction.configuration.mcpServerViewId = action.mcpServerViewId;

  builderAction.name = "";
  builderAction.description = "";

  builderAction.configuration.dataSourceConfigurations = action.dataSources
    ? await renderDataSourcesConfigurations(
        { ...action, dataSources: action.dataSources }, // repeating action.dataSources to satisfy the typing
        dataSourceViews
      )
    : null;

  builderAction.configuration.tablesConfigurations = action.tables
    ? await renderTableDataSourcesConfigurations(
        { ...action, tables: action.tables },
        dataSourceViews
      )
    : null;

  builderAction.configuration.childAgentId = action.childAgentId;

  builderAction.configuration.additionalConfiguration =
    action.additionalConfiguration;

  return builderAction;
}

async function renderDataSourcesConfigurations(
  action:
    | RetrievalConfigurationType
    | ProcessConfigurationType
    | (MCPServerConfigurationType & { dataSources: DataSourceConfiguration[] }),
  dataSourceViews: DataSourceViewResource[]
): Promise<DataSourceViewSelectionConfigurations> {
  const selectedResources = action.dataSources.map((ds) => ({
    dataSourceViewId: ds.dataSourceViewId,
    resources: ds.filter.parents?.in ?? null,
    isSelectAll: !ds.filter.parents,
    tagsFilter: ds.filter.tags || null, // todo(TAF) Remove this when we don't need to support optional tags from builder.
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
          tagsFilter: sr.tagsFilter,
        };
      }

      const contentNodesRes = await getContentNodesForDataSourceView(
        dataSourceView,
        {
          internalIds: sr.resources,
          viewType: "document",
        }
      );

      if (contentNodesRes.isErr()) {
        logger.error(
          {
            action: {
              id: action.id,
              type: action.type,
            },
            dataSourceView: dataSourceView.toTraceJSON(),
            error: contentNodesRes.error,
            internalIds: sr.resources,
            workspace: {
              id: dataSourceView.workspaceId,
            },
          },
          "Agent Builder: Error fetching content nodes for documents."
        );

        return {
          dataSourceView: serializedDataSourceView,
          selectedResources: [],
          isSelectAll: sr.isSelectAll,
          tagsFilter: sr.tagsFilter,
        };
      }

      return {
        dataSourceView: serializedDataSourceView,
        selectedResources: contentNodesRes.value.nodes,
        isSelectAll: sr.isSelectAll,
        tagsFilter: sr.tagsFilter,
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
  action:
    | TablesQueryConfigurationType
    | (MCPServerConfigurationType & { tables: TableDataSourceConfiguration[] }),
  dataSourceViews: DataSourceViewResource[]
): Promise<DataSourceViewSelectionConfigurations> {
  const selectedResources = action.tables.map((table) => ({
    dataSourceViewId: table.dataSourceViewId,
    resources: [table.tableId],
    // `isSelectAll`  & `tagsFilter` are always false for TablesQueryConfiguration.
    isSelectAll: false,
    tagsFilter: null,
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
            internalIds: sr.resources,
            viewType: "table",
          }
        );

        if (contentNodesRes.isErr()) {
          logger.error(
            {
              action: {
                id: action.id,
                type: action.type,
              },
              dataSourceView: dataSourceView.toTraceJSON(),
              error: contentNodesRes.error,
              internalIds: sr.resources,
              workspace: {
                id: dataSourceView.workspaceId,
              },
            },
            "Agent Builder: Error fetching content nodes for tables."
          );

          return {
            dataSourceView: serializedDataSourceView,
            selectedResources: [],
            isSelectAll: sr.isSelectAll,
            tagsFilter: sr.tagsFilter,
          };
        }

        return {
          dataSourceView: serializedDataSourceView,
          selectedResources: contentNodesRes.value.nodes,
          isSelectAll: sr.isSelectAll,
          tagsFilter: sr.tagsFilter,
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
