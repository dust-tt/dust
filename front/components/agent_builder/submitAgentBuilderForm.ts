import type {
  AdditionalConfigurationInBuilderType,
  AgentBuilderFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { getTableIdForContentNode } from "@app/components/assistant_builder/shared";
import type { TableDataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import type { AdditionalConfigurationType } from "@app/lib/models/assistant/actions/mcp";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  DataSourcesConfigurationsCodecType,
  DataSourceViewSelectionConfigurations,
  LightAgentConfigurationType,
  PostOrPatchAgentConfigurationRequestBody,
  Result,
  WorkspaceType,
} from "@app/types";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

function processDataSourceConfigurations(
  dataSourceConfigurations: DataSourceViewSelectionConfigurations,
  owner: WorkspaceType
): DataSourcesConfigurationsCodecType {
  return Object.values(dataSourceConfigurations).map((config) => ({
    dataSourceViewId: config.dataSourceView.sId,
    workspaceId: owner.sId,
    filter: {
      parents: config.isSelectAll
        ? null
        : {
            in: config.selectedResources.map((resource) => resource.internalId),
            not: config.excludedResources.map(
              (resource) => resource.internalId
            ),
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
  tablesConfigurations: DataSourceViewSelectionConfigurations | null,
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

export function processAdditionalConfiguration(
  additionalConfiguration: AdditionalConfigurationInBuilderType
): AdditionalConfigurationType {
  // In agent builder v2, the additional configuration can be nested.
  // However, in the database, we store the additional configuration as a flat object with the nested objects flattened using the dot notation.
  // We need to flatten the additional configuration back into a nested object.

  const flattenConfig = (
    config: AdditionalConfigurationInBuilderType,
    output: AdditionalConfigurationType,
    prefix?: string
  ): AdditionalConfigurationType => {
    for (const [key, value] of Object.entries(config)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "object" && !Array.isArray(value)) {
        output = flattenConfig(value, output, path);
      } else {
        output[path] = value;
      }
    }

    return output;
  };

  return flattenConfig(additionalConfiguration, {});
}

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
              type: "mcp_server_configuration",
              mcpServerViewId: action.configuration.mcpServerViewId,
              name: action.name,
              description: action.description,
              dataSources:
                action.configuration.dataSourceConfigurations !== null
                  ? processDataSourceConfigurations(
                      action.configuration.dataSourceConfigurations,
                      owner
                    )
                  : null,
              tables:
                action.configuration.tablesConfigurations !== null
                  ? processTableSelection(
                      action.configuration.tablesConfigurations,
                      owner
                    )
                  : null,
              childAgentId: action.configuration.childAgentId,
              reasoningModel: action.configuration.reasoningModel,
              timeFrame: action.configuration.timeFrame,
              jsonSchema: action.configuration.jsonSchema,
              additionalConfiguration:
                action.configuration.additionalConfiguration !== null
                  ? processAdditionalConfiguration(
                      action.configuration.additionalConfiguration
                    )
                  : {},
              dustAppConfiguration: action.configuration.dustAppConfiguration,
            },
          ];
        }

        return [];
      }),
      visualizationEnabled: formData.actions.some(
        (action) => action.type === "DATA_VISUALIZATION"
      ),
      templateId: null,
      tags: formData.agentSettings.tags,
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
        logger.error(
          {
            workspaceId: owner.sId,
            agentConfigurationId,
            endpoint,
            body: JSON.stringify(requestBody),
            httpStatus: response.status,
            errorMessage: error.error?.message,
          },
          "[Agent builder] - Form submission failed"
        );
        return new Err(
          new Error(error.error?.message || "Failed to save agent")
        );
      } catch {
        logger.error(
          {
            workspaceId: owner.sId,
            agentConfigurationId,
            body: JSON.stringify(requestBody),
            endpoint,
            httpStatus: response.status,
          },
          "[Agent builder] - Form submission failed with unparseable error response"
        );
        return new Err(new Error("An error occurred while saving the agent."));
      }
    }

    const result: {
      agentConfiguration: LightAgentConfigurationType | AgentConfigurationType;
    } = await response.json();

    const agentConfiguration = result.agentConfiguration;

    // We don't update Slack channels nor triggers when saving a draft agent.
    if (isDraft) {
      return new Ok(agentConfiguration);
    }

    const { slackChannels, slackProvider } = formData.agentSettings;
    // If the user selected channels that were already routed to a different agent, the current behavior is to
    // unlink them from the previous agent and link them to this one.
    if (slackProvider && slackChannels.length > 0) {
      const autoRespondWithoutMention =
        slackChannels[0].autoRespondWithoutMention;
      const slackRequestBody = JSON.stringify({
        provider: slackProvider,
        slack_channel_internal_ids: slackChannels.map(
          ({ slackChannelId }) => slackChannelId
        ),
        auto_respond_without_mention: autoRespondWithoutMention,
      });
      const slackLinkRes = await fetch(
        `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}/linked_slack_channels`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: slackRequestBody,
        }
      );

      if (!slackLinkRes.ok) {
        logger.error(
          {
            workspaceId: owner.sId,
            agentConfigurationId: agentConfiguration.sId,
            httpStatus: slackLinkRes.status,
            body: slackRequestBody,
            slackChannelsCount: slackChannels.length,
          },
          "[Agent builder] - Failed to link Slack channels to agent"
        );
        return new Err(
          new Error("An error occurred while linking Slack channels.")
        );
      }
    }

    const triggerSyncRes = await fetch(
      `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}/triggers`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          triggers: formData.triggers,
        }),
      }
    );

    if (!triggerSyncRes.ok) {
      try {
        const error = await triggerSyncRes.json();
        logger.error(
          {
            workspaceId: owner.sId,
            agentConfigurationId: agentConfiguration.sId,
            errorMessage: error?.api_error?.message || error?.error?.message,
            triggersCount: formData.triggers.length,
          },
          "[Agent builder] - Failed to sync triggers for agent"
        );
        return new Err(
          new Error(
            error?.api_error?.message ||
              error?.error?.message ||
              "An error occurred while syncing triggers."
          )
        );
      } catch {
        logger.error(
          {
            workspaceId: owner.sId,
            agentConfigurationId: agentConfiguration.sId,
            triggersCount: formData.triggers.length,
          },
          "[Agent builder] - Failed to sync triggers for agent with unparseable error response"
        );
        return new Err(new Error("An error occurred while syncing triggers."));
      }
    }

    return new Ok(agentConfiguration);
  } catch (error) {
    logger.error(
      {
        workspaceId: owner.sId,
        agentConfigurationId,
        isDraft,

        error: normalizeError(error),
      },
      "Unexpected error during agent builder form submission"
    );
    return new Err(normalizeError(error));
  }
}
