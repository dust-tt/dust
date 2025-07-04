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

import type { AgentBuilderFormData } from "./AgentBuilderFormContext";
import type {
  ExtractDataAgentBuilderAction,
  IncludeDataAgentBuilderAction,
  SearchAgentBuilderAction,
} from "./types";
import {
  isExtractDataAction,
  isIncludeDataAction,
  isSearchAction,
} from "./types";

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
  // TODO: some values are currently mocked for the sake of testing agent creation
  const requestBody: PostOrPatchAgentConfigurationRequestBody = {
    assistant: {
      name: formData.agentSettings.name,
      description: formData.agentSettings.description,
      instructions: formData.instructions,
      pictureUrl:
        formData.agentSettings.pictureUrl ||
        "https://dust.tt/static/assistants/logo.svg",
      status: isDraft ? "draft" : "active",
      scope: "visible", // Default to visible
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
      maxStepsPerRun: formData.maxStepsPerRun,
      visualizationEnabled: formData.actions.some(
        (action) => action.type === "DATA_VISUALIZATION"
      ),
      templateId: null,
      tags: [],
      editors: [],
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

    return new Ok(result.agentConfiguration);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
