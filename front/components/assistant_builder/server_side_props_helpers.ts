import assert from "assert";
import { tracer } from "dd-trace";

import type { AssistantBuilderMCPConfiguration } from "@app/components/assistant_builder/types";
import { getDefaultMCPServerActionConfiguration } from "@app/components/assistant_builder/types";
import { REASONING_MODEL_CONFIGS } from "@app/components/providers/types";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type {
  DataSourceConfiguration,
  TableDataSourceConfiguration,
} from "@app/lib/api/assistant/configuration/types";
import { getContentNodesForDataSourceView } from "@app/lib/api/data_source_view";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  DataSourceViewContentNode,
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
  TemplateAgentConfigurationType,
} from "@app/types";

// We are moving resource fetch to the client side. Until we finish,
// we will keep this duplicated version for fetching actions.
export const getAccessibleSourcesAndAppsForActions = async (
  auth: Authenticator
) => {
  return tracer.trace("getAccessibleSourcesAndAppsForActions", async () => {
    const accessibleSpaces = (
      await SpaceResource.listWorkspaceSpaces(auth)
    ).filter((space) => !space.isSystem() && space.canRead(auth));

    const [dsViews, allMCPServerViews] = await Promise.all([
      DataSourceViewResource.listBySpaces(auth, accessibleSpaces, {
        includeEditedBy: true,
      }),
      MCPServerViewResource.listBySpaces(auth, accessibleSpaces),
    ]);

    return {
      spaces: accessibleSpaces,
      dataSourceViews: dsViews,
      mcpServerViews: allMCPServerViews,
    };
  });
};

export async function buildInitialActions({
  dataSourceViews,
  configuration,
  mcpServerViews = [],
}: {
  dataSourceViews: DataSourceViewResource[];
  configuration: AgentConfigurationType | TemplateAgentConfigurationType;
  mcpServerViews?: MCPServerViewType[];
}): Promise<AssistantBuilderMCPConfiguration[]> {
  const builderActions: AssistantBuilderMCPConfiguration[] = [];

  for (const action of configuration.actions) {
    assert(
      action.type === "mcp_server_configuration",
      "Legacy action type, non-MCP, are no longer supported."
    );
    const mcpServerView = mcpServerViews.find(
      (mcpServerView) => mcpServerView.server.name === action.name
    );

    const builderAction = await getMCPServerActionConfiguration(
      action,
      dataSourceViews,
      mcpServerView
    );

    if (builderAction) {
      // TODO(durable agents, 2025-06-24): remove this once we have a proper
      // type for the builder action. Namely, initializeBuilderAction return
      // type should be AssistantBuilderMCPConfiguration.
      assert(
        builderAction.type === "MCP",
        "Builder action is not a MCP server configuration"
      );

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

async function getMCPServerActionConfiguration(
  action: MCPServerConfigurationType,
  dataSourceViews: DataSourceViewResource[],
  mcpServerView?: MCPServerViewType
): Promise<AssistantBuilderMCPConfiguration> {
  assert(isServerSideMCPServerConfiguration(action));

  const builderAction = getDefaultMCPServerActionConfiguration(mcpServerView);
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

  builderAction.configuration.dustAppConfiguration =
    action.dustAppConfiguration;

  builderAction.configuration.childAgentId = action.childAgentId;

  const { reasoningModel } = action;
  if (reasoningModel) {
    const supportedReasoningModel = REASONING_MODEL_CONFIGS.find(
      (m) =>
        m.modelId === reasoningModel.modelId &&
        m.providerId === reasoningModel.providerId
    );
    if (supportedReasoningModel) {
      const { modelId, providerId } = supportedReasoningModel;
      builderAction.configuration.reasoningModel = {
        modelId,
        providerId,
        temperature: null,
        reasoningEffort:
          reasoningModel.reasoningEffort ??
          supportedReasoningModel.defaultReasoningEffort,
      };
    }
  }

  builderAction.configuration.timeFrame = action.timeFrame;
  builderAction.configuration.jsonSchema = action.jsonSchema;
  builderAction.configuration._jsonSchemaString = action.jsonSchema
    ? JSON.stringify(action.jsonSchema, null, 2)
    : null;
  builderAction.configuration.additionalConfiguration =
    action.additionalConfiguration;

  return builderAction;
}

async function renderDataSourcesConfigurations(
  action: MCPServerConfigurationType & {
    dataSources: DataSourceConfiguration[];
  },
  dataSourceViews: DataSourceViewResource[]
): Promise<DataSourceViewSelectionConfigurations> {
  const localLogger = logger.child({
    action: {
      id: action.id,
      type: action.type,
    },
  });

  const selectedResources = action.dataSources.map((ds) => {
    const parents = ds.filter.parents;
    // Select-all when no parents filter, or when parents.in is null
    // (possibly with exclusions via parents.not).
    const isSelectAll = !parents || parents.in == null;

    return {
      dataSourceViewId: ds.dataSourceViewId,
      resources: parents?.in ?? null,
      excludedResources: parents?.not ?? null,
      isSelectAll,
      tagsFilter: ds.filter.tags ?? null,
    };
  });

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

      if (!sr.resources) {
        // No explicit included resources means either true select-all or
        // select-all-with-exclusions. In both cases, preserve and materialize
        // excluded resources if provided so the UI can reconstruct the tree.
        let excludedResources: DataSourceViewContentNode[] = [];
        if (sr.excludedResources && sr.excludedResources.length > 0) {
          const excludedContentNodes = await getContentNodesForDataSourceView(
            dataSourceView,
            { internalIds: sr.excludedResources, viewType: "all" }
          );
          if (excludedContentNodes.isErr()) {
            localLogger.error(
              {
                dataSourceView: dataSourceView.toTraceJSON(),
                error: excludedContentNodes.error,
                internalIds: sr.excludedResources,
                workspace: {
                  id: dataSourceView.workspaceId,
                },
              },
              "Agent Builder: Error fetching excluded content nodes for documents."
            );
          } else {
            excludedResources = excludedContentNodes.value.nodes;
          }
        }

        return {
          dataSourceView: serializedDataSourceView,
          selectedResources: [],
          excludedResources,
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
        localLogger.error(
          {
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
          excludedResources: [],
          isSelectAll: sr.isSelectAll,
          tagsFilter: sr.tagsFilter,
        };
      }

      let excludedResources: DataSourceViewContentNode[] = [];
      if (sr.excludedResources && sr.excludedResources.length > 0) {
        const excludedContentNodes = await getContentNodesForDataSourceView(
          dataSourceView,
          { internalIds: sr.excludedResources, viewType: "all" }
        );
        if (excludedContentNodes.isErr()) {
          localLogger.error(
            {
              dataSourceView: dataSourceView.toTraceJSON(),
              error: excludedContentNodes.error,
              internalIds: sr.excludedResources,
              workspace: {
                id: dataSourceView.workspaceId,
              },
            },
            "Agent Builder: Error fetching excluded content nodes for documents."
          );
        } else {
          excludedResources = excludedContentNodes.value.nodes;
        }
      }

      const withResourcesResult = {
        dataSourceView: serializedDataSourceView,
        selectedResources: contentNodesRes.value.nodes,
        excludedResources,
        isSelectAll: sr.isSelectAll,
        tagsFilter: sr.tagsFilter,
      };

      return withResourcesResult;
    })
  );

  const reduced = dataSourceConfigurationsArray.reduce(
    (acc, curr) => ({
      ...acc,
      [curr.dataSourceView.sId]: curr,
    }),
    {} as DataSourceViewSelectionConfigurations
  );

  return reduced;
}

async function renderTableDataSourcesConfigurations(
  action: MCPServerConfigurationType & {
    tables: TableDataSourceConfiguration[];
  },
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
            excludedResources: [],
            isSelectAll: sr.isSelectAll,
            tagsFilter: sr.tagsFilter,
          };
        }

        return {
          dataSourceView: serializedDataSourceView,
          selectedResources: contentNodesRes.value.nodes,
          excludedResources: [], // this will stay empty as TablesQueryConfiguration doesn't support exclusions
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

      acc[sId].excludedResources = [];

      return acc;
    },
    {}
  );
}
