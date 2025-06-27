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

export async function submitAgentBuilderForm({
  formData,
  owner,
  agentConfigurationId = null,
  isDraft = false,
}: {
  formData: AgentBuilderFormData;
  owner: WorkspaceType;
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
      pictureUrl: "https://dust.tt/static/assistants/logo.svg", // Default avatar for now
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
      actions: formData.actions.map((action) => ({
        type: "mcp_server_configuration",
        mcpServerViewId: action.id,
        name: action.name,
        description: action.description,
        dataSources: null,
        tables: null,
        childAgentId: null,
        reasoningModel: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        dustAppConfiguration: null,
      })),
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
