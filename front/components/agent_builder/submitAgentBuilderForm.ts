import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import type {
  ExtractDataAgentBuilderAction,
  IncludeDataAgentBuilderAction,
  SearchAgentBuilderAction,
} from "@app/components/agent_builder/types";
import {
  isExtractDataAction,
  isIncludeDataAction,
  isSearchAction,
} from "@app/components/agent_builder/types";
import { getTableIdForContentNode } from "@app/components/assistant_builder/shared";
import type { TableDataSourceConfiguration } from "@app/lib/api/assistant/configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type {
  AgentConfigurationType,
  DataSourceViewSelectionConfigurations,
  LightAgentConfigurationType,
  PostOrPatchAgentConfigurationRequestBody,
  Result,
  WorkspaceType,
} from "@app/types";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

function convertDataSourceConfigurations(
  dataSourceConfigurations: DataSourceViewSelectionConfigurations,
  owner: WorkspaceType
) {
  return Object.values(dataSourceConfigurations).map((config) => ({
    dataSourceViewId: config.dataSourceView.sId,
    workspaceId: owner.sId,
    filter: {
      parents: config.isSelectAll
        ? null
        : {
            in: config.selectedResources.map((resource) => resource.internalId),
            not: [],
          },
      tags: config.tagsFilter
        ? {
            in: config.tagsFilter.in,
            not: config.tagsFilter.not,
            mode: config.tagsFilter.mode,
          }
        : null,
    },
  }));
}

function processTableSelection(
  tablesConfigurations:
    | DataSourceViewSelectionConfigurations
    | null
    | undefined,
  owner: WorkspaceType
): TableDataSourceConfiguration[] | null {
  if (!tablesConfigurations || Object.keys(tablesConfigurations).length === 0) {
    return null;
  }

  const tables = Object.values(tablesConfigurations).flatMap(
    ({ dataSourceView, selectedResources }) => {
      return selectedResources.map((resource) => ({
        dataSourceViewId: dataSourceView.sId,
        workspaceId: owner.sId,
        tableId: getTableIdForContentNode(dataSourceView.dataSource, resource),
      }));
    }
  );

  return tables.length > 0 ? tables : null;
}

function convertSearchActionToMCPConfiguration(
  searchAction: SearchAgentBuilderAction,
  searchMCPServerView: MCPServerViewType,
  owner: WorkspaceType
): PostOrPatchAgentConfigurationRequestBody["assistant"]["actions"][number] {
  const dataSources = convertDataSourceConfigurations(
    searchAction.configuration.dataSourceConfigurations,
    owner
  );

  return {
    type: "mcp_server_configuration",
    mcpServerViewId: searchMCPServerView.sId,
    name: searchAction.name,
    description: searchAction.description,
    dataSources,
    tables: null,
    childAgentId: null,
    reasoningModel: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    dustAppConfiguration: null,
  };
}

// Generic MCP server view finder
function getMCPServerViewByName(
  mcpServerViews: MCPServerViewType[],
  serverName: string
): MCPServerViewType {
  const mcpServerView = mcpServerViews.find(
    (view) =>
      view.server.name === serverName && view.server.availability === "auto"
  );

  if (!mcpServerView) {
    throw new Error(`${serverName} MCP server view not found`);
  }

  return mcpServerView;
}

function getSearchMCPServerView(
  mcpServerViews: MCPServerViewType[]
): MCPServerViewType {
  return getMCPServerViewByName(mcpServerViews, "search");
}

function convertIncludeDataActionToMCPConfiguration(
  includeDataAction: IncludeDataAgentBuilderAction,
  includeDataMCPServerView: MCPServerViewType,
  owner: WorkspaceType
): PostOrPatchAgentConfigurationRequestBody["assistant"]["actions"][number] {
  const dataSources = convertDataSourceConfigurations(
    includeDataAction.configuration.dataSourceConfigurations,
    owner
  );

  return {
    type: "mcp_server_configuration",
    mcpServerViewId: includeDataMCPServerView.sId,
    name: includeDataAction.name,
    description: includeDataAction.description,
    dataSources,
    tables: null,
    childAgentId: null,
    reasoningModel: null,
    timeFrame: includeDataAction.configuration.timeFrame,
    jsonSchema: null,
    additionalConfiguration: {},
    dustAppConfiguration: null,
  };
}

function getIncludeDataMCPServerView(
  mcpServerViews: MCPServerViewType[]
): MCPServerViewType {
  return getMCPServerViewByName(mcpServerViews, "include_data");
}

function convertExtractDataActionToMCPConfiguration(
  extractDataAction: ExtractDataAgentBuilderAction,
  extractDataMCPServerView: MCPServerViewType,
  owner: WorkspaceType
): PostOrPatchAgentConfigurationRequestBody["assistant"]["actions"][number] {
  const dataSources = convertDataSourceConfigurations(
    extractDataAction.configuration.dataSourceConfigurations,
    owner
  );

  return {
    type: "mcp_server_configuration",
    mcpServerViewId: extractDataMCPServerView.sId,
    name: extractDataAction.name,
    description: extractDataAction.description,
    dataSources,
    tables: null,
    childAgentId: null,
    reasoningModel: null,
    timeFrame: extractDataAction.configuration.timeFrame,
    jsonSchema: extractDataAction.configuration.jsonSchema,
    additionalConfiguration: {},
    dustAppConfiguration: null,
  };
}

function getExtractDataMCPServerView(
  mcpServerViews: MCPServerViewType[]
): MCPServerViewType {
  return getMCPServerViewByName(mcpServerViews, "extract_data");
}

export async function submitAgentBuilderForm({
  formData,
  owner,
  mcpServerViews,
  agentConfigurationId = null,
  isDraft = false,
}: {
  formData: AgentBuilderFormData;
  owner: WorkspaceType;
  mcpServerViews: MCPServerViewType[];
  agentConfigurationId?: string | null;
  isDraft?: boolean;
}): Promise<
  Result<LightAgentConfigurationType | AgentConfigurationType, Error>
> {
  const requestBody: PostOrPatchAgentConfigurationRequestBody = {
    assistant: {
      name: formData.agentSettings.name,
      description: formData.agentSettings.description,
      instructions: formData.instructions,
      pictureUrl:
        formData.agentSettings.pictureUrl ||
        "https://dust.tt/static/assistants/logo.svg",
      status: isDraft ? "draft" : "active",
      scope: formData.agentSettings.scope,
      model: {
        modelId: formData.generationSettings.modelSettings.modelId,
        providerId: formData.generationSettings.modelSettings.providerId,
        temperature: formData.generationSettings.temperature,
        reasoningEffort: formData.generationSettings.reasoningEffort,
        responseFormat: formData.generationSettings.responseFormat,
      },
      actions: formData.actions.flatMap((action) => {
        if (action.type === "DATA_VISUALIZATION") {
          return [];
        }

        if (action.type === "MCP") {
          return [
            {
              type: "mcp_server_configuration" as const,
              mcpServerViewId: action.configuration.mcpServerViewId,
              name: action.name,
              description: action.description,
              dataSources: action.configuration.dataSourceConfigurations
                ? convertDataSourceConfigurations(
                    action.configuration.dataSourceConfigurations,
                    owner
                  )
                : null,
              tables: processTableSelection(
                action.configuration.tablesConfigurations,
                owner
              ),
              childAgentId: action.configuration.childAgentId,
              reasoningModel: action.configuration.reasoningModel,
              timeFrame: action.configuration.timeFrame,
              jsonSchema: action.configuration.jsonSchema,
              additionalConfiguration:
                action.configuration.additionalConfiguration,
              dustAppConfiguration: action.configuration.dustAppConfiguration,
            },
          ];
        }

        if (isSearchAction(action)) {
          const searchMCPServerView = getSearchMCPServerView(mcpServerViews);
          return [
            convertSearchActionToMCPConfiguration(
              action,
              searchMCPServerView,
              owner
            ),
          ];
        }

        if (isIncludeDataAction(action)) {
          const includeDataMCPServerView =
            getIncludeDataMCPServerView(mcpServerViews);
          return [
            convertIncludeDataActionToMCPConfiguration(
              action,
              includeDataMCPServerView,
              owner
            ),
          ];
        }

        if (isExtractDataAction(action)) {
          const extractDataMCPServerView =
            getExtractDataMCPServerView(mcpServerViews);
          return [
            convertExtractDataActionToMCPConfiguration(
              action,
              extractDataMCPServerView,
              owner
            ),
          ];
        }

        return [];
      }),
      visualizationEnabled: formData.actions.some(
        (action) => action.type === "DATA_VISUALIZATION"
      ),
      templateId: null,
      tags: [],
      editors: formData.agentSettings.editors.map((editor) => ({
        sId: editor.sId,
      })),
    },
  };

  const endpoint = agentConfigurationId
    ? `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}`
    : `/api/w/${owner.sId}/assistant/agent_configurations`;

  const method = agentConfigurationId ? "PATCH" : "POST";

  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        return new Err(
          new Error(error.error?.message || "Failed to save agent")
        );
      } catch {
        return new Err(new Error("An error occurred while saving the agent."));
      }
    }

    const result: {
      agentConfiguration: LightAgentConfigurationType | AgentConfigurationType;
    } = await response.json();

    const agentConfiguration = result.agentConfiguration;

    const { slackChannels, slackProvider } = formData.agentSettings;
    // PATCH the linked Slack channels if either:
    // - there were already linked channels
    // - there are newly selected channels
    // If the user selected channels that were already routed to a different agent, the current behavior is to
    // unlink them from the previous agent and link them to this one.
    if (slackChannels.length) {
      const slackLinkRes = await fetch(
        `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}/linked_slack_channels`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            provider: slackProvider,
            slack_channel_internal_ids: slackChannels.map(
              ({ slackChannelId }) => slackChannelId
            ),
          }),
        }
      );

      if (!slackLinkRes.ok) {
        return new Err(
          new Error("An error occurred while linking Slack channels.")
        );
      }
    }

    return new Ok(agentConfiguration);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
