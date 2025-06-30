import type { MCPServerViewType } from "@app/lib/api/mcp";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
  PostOrPatchAgentConfigurationRequestBody,
  Result,
  WorkspaceType,
} from "@app/types";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import type { AgentBuilderFormData } from "./AgentBuilderFormContext";
import type { SearchAgentBuilderAction } from "./types";
import { isSearchAction } from "./types";

function convertSearchActionToMCPConfiguration(
  searchAction: SearchAgentBuilderAction,
  searchMCPServerView: MCPServerViewType,
  owner: WorkspaceType
): PostOrPatchAgentConfigurationRequestBody["assistant"]["actions"][number] {
  const dataSources = Object.values(
    searchAction.configuration.dataSourceConfigurations
  ).map((config) => ({
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

function getSearchMCPServerView(
  mcpServerViews: MCPServerViewType[]
): MCPServerViewType {
  const searchMCPServerView = mcpServerViews.find(
    (view) =>
      view.server.name === "search" && view.server.availability === "auto"
  );

  if (!searchMCPServerView) {
    throw new Error("Search MCP server view not found");
  }

  return searchMCPServerView;
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
        reasoningEffort:
          formData.generationSettings.modelSettings.reasoningEffort,
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
