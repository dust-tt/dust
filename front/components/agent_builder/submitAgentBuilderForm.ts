import type {
  AdditionalConfigurationInBuilderType,
  AgentBuilderFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { DROID_AVATAR_URLS } from "@app/components/agent_builder/settings/avatar_picker/types";
import {
  expandFoldersToTables,
  getTableIdForContentNode,
} from "@app/components/assistant_builder/shared";
import type { TableDataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import type { AdditionalConfigurationType } from "@app/lib/models/assistant/actions/mcp";
import { fetcherWithBody } from "@app/lib/swr/swr";
import {
  trackEvent,
  TRACKING_ACTIONS,
  TRACKING_AREAS,
} from "@app/lib/tracking";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import datadogLogger from "@app/logger/datadogLogger";
import type {
  GetContentNodesOrChildrenRequestBodyType,
  GetDataSourceViewContentNodes,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/content-nodes";
import type {
  AgentConfigurationType,
  DataSourcesConfigurationsCodecType,
  DataSourceViewSelectionConfigurations,
  LightAgentConfigurationType,
  PostOrPatchAgentConfigurationRequestBody,
  Result,
  UserType,
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
      parents: {
        in: config.isSelectAll
          ? null
          : config.selectedResources.map((resource) => resource.internalId),
        not: config.excludedResources.map((resource) => resource.internalId),
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

async function processTableSelection(
  tablesConfigurations: DataSourceViewSelectionConfigurations | null,
  owner: WorkspaceType
): Promise<TableDataSourceConfiguration[] | null> {
  if (!tablesConfigurations || Object.keys(tablesConfigurations).length === 0) {
    return null;
  }

  const allTables: TableDataSourceConfiguration[] = [];

  for (const {
    dataSourceView,
    selectedResources,
    isSelectAll,
    excludedResources,
  } of Object.values(tablesConfigurations)) {
    let resourcesToProcess = selectedResources;

    // If isSelectAll is true, we need to fetch all resources from the data source view
    if (isSelectAll) {
      try {
        const url = `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_source_views/${dataSourceView.sId}/content-nodes`;
        const body: GetContentNodesOrChildrenRequestBodyType = {
          internalIds: undefined,
          parentId: undefined,
          viewType: "table",
          sorting: undefined,
        };

        const result: GetDataSourceViewContentNodes = await fetcherWithBody([
          url,
          body,
          "POST",
        ]);

        const excludedIds = new Set(excludedResources.map((r) => r.internalId));
        resourcesToProcess = result.nodes.filter(
          (node) => !excludedIds.has(node.internalId)
        );
      } catch (error) {
        datadogLogger.error(
          {
            workspaceId: owner.sId,
            dataSourceViewId: dataSourceView.sId,
            error: normalizeError(error),
          },
          "[Agent builder] - Failed to fetch all resources for `isSelectAll`"
        );
        throw new Error(
          `Failed to fetch resources for data source view ${dataSourceView.sId}`
        );
      }
    }

    const folderResources = resourcesToProcess.filter(
      (resource) => resource.type === "folder"
    );
    const tableResources = resourcesToProcess.filter(
      (resource) => resource.type === "table"
    );

    // Process direct table selections
    for (const resource of tableResources) {
      allTables.push({
        dataSourceViewId: dataSourceView.sId,
        workspaceId: owner.sId,
        tableId: getTableIdForContentNode(dataSourceView.dataSource, resource),
      });
    }

    // Expand folders to tables
    if (folderResources.length > 0) {
      try {
        const expandedTables = await expandFoldersToTables(
          owner,
          dataSourceView,
          folderResources
        );
        for (const tableNode of expandedTables) {
          allTables.push({
            dataSourceViewId: dataSourceView.sId,
            workspaceId: owner.sId,
            tableId: getTableIdForContentNode(
              dataSourceView.dataSource,
              tableNode
            ),
          });
        }
      } catch (error) {
        datadogLogger.error(
          {
            workspaceId: owner.sId,
            dataSourceViewId: dataSourceView.sId,
            folderCount: folderResources.length,
            error: normalizeError(error),
          },
          "[Agent builder] - Failed to expand folders to tables"
        );
        throw new Error(
          `Failed to expand folders for data source view ${dataSourceView.sId}`
        );
      }
    }
  }

  return allTables.length > 0 ? allTables : null;
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

/**
 * Process triggers for an agent: validate, delete, update, and create.
 * Handles all trigger operations in the correct order (DELETE -> PATCH -> POST).
 */
async function processTriggers({
  formData,
  owner,
  agentConfigurationId,
  userId,
}: {
  formData: AgentBuilderFormData;
  owner: WorkspaceType;
  agentConfigurationId: string;
  userId: number | null;
}): Promise<Result<void, Error>> {
  // Only submit triggers that belong to the current user to avoid updating other users' triggers
  if (!userId) {
    return new Err(new Error("A user is required to update triggers"));
  }

  // Validate trigger names are unique
  const allTriggerNames = [
    ...formData.triggersToCreate.map((t) => t.name),
    ...formData.triggersToUpdate.map((t) => t.name),
  ];
  const uniqueTriggerNames = new Set(allTriggerNames);
  if (uniqueTriggerNames.size !== allTriggerNames.length) {
    datadogLogger.error(
      {
        workspaceId: owner.sId,
        agentConfigurationId,
        triggerNames: allTriggerNames,
      },
      "[Agent builder] - Duplicate trigger names found"
    );
    return new Err(
      new Error("Trigger names must be unique for a given agent.")
    );
  }

  // Process triggers in order: DELETE -> PATCH -> POST (batch operations)
  // 1. Batch delete triggers
  if (formData.triggersToDelete.length > 0) {
    const deleteRes = await fetch(
      `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}/triggers`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          triggerIds: formData.triggersToDelete,
        }),
      }
    );

    if (!deleteRes.ok) {
      const error = await deleteRes.json();
      datadogLogger.error(
        {
          workspaceId: owner.sId,
          agentConfigurationId,
          triggerIds: formData.triggersToDelete,
          errorMessage: error?.api_error?.message || error?.error?.message,
        },
        "[Agent builder] - Failed to delete triggers"
      );
      return new Err(new Error("An error occurred while deleting triggers."));
    }
  }

  // 2. Batch update existing triggers
  if (formData.triggersToUpdate.length > 0) {
    const updateRes = await fetch(
      `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}/triggers`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          triggers: formData.triggersToUpdate.map((trigger) => ({
            sId: trigger.sId,
            name: trigger.name,
            customPrompt: trigger.customPrompt,
            configuration: trigger.configuration,
            kind: trigger.kind,
            webhookSourceViewSId:
              trigger.kind === "webhook"
                ? trigger.webhookSourceViewSId
                : undefined,
          })),
        }),
      }
    );

    if (!updateRes.ok) {
      const error = await updateRes.json();
      datadogLogger.error(
        {
          workspaceId: owner.sId,
          agentConfigurationId,
          triggersCount: formData.triggersToUpdate.length,
          errorMessage: error?.api_error?.message || error?.error?.message,
        },
        "[Agent builder] - Failed to update triggers"
      );
      return new Err(new Error("An error occurred while updating triggers."));
    }
  }

  // 3. Batch create new triggers
  if (formData.triggersToCreate.length > 0) {
    const createRes = await fetch(
      `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}/triggers`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          triggers: formData.triggersToCreate.map((trigger) => ({
            name: trigger.name,
            customPrompt: trigger.customPrompt,
            configuration: trigger.configuration,
            kind: trigger.kind,
            webhookSourceViewSId:
              trigger.kind === "webhook"
                ? trigger.webhookSourceViewSId
                : undefined,
          })),
        }),
      }
    );

    if (!createRes.ok) {
      const error = await createRes.json();
      datadogLogger.error(
        {
          workspaceId: owner.sId,
          agentConfigurationId,
          triggersCount: formData.triggersToCreate.length,
          errorMessage: error?.api_error?.message || error?.error?.message,
        },
        "[Agent builder] - Failed to create triggers"
      );
      return new Err(new Error("An error occurred while creating triggers."));
    }
  }

  return new Ok(undefined);
}

export async function submitAgentBuilderForm({
  user,
  formData,
  owner,
  agentConfigurationId = null,
  isDraft = false,
  areSlackChannelsChanged,
}: {
  user: UserType;
  formData: AgentBuilderFormData;
  owner: WorkspaceType;
  agentConfigurationId?: string | null;
  isDraft?: boolean;
  areSlackChannelsChanged?: boolean;
}): Promise<
  Result<LightAgentConfigurationType | AgentConfigurationType, Error>
> {
  const allDefaultAvatars = [...DROID_AVATAR_URLS];
  const getRandomDefaultAvatar = () =>
    allDefaultAvatars[Math.floor(Math.random() * allDefaultAvatars.length)];
  const pictureUrlToUse =
    formData.agentSettings.pictureUrl ?? getRandomDefaultAvatar();

  // Process actions asynchronously to handle folder-to-table expansion
  const mcpActions = formData.actions.filter((action) => action.type === "MCP");

  let processedActions;
  try {
    processedActions = await concurrentExecutor(
      mcpActions,
      async (action) => {
        if (!action.configuration) {
          throw new Error(`MCP action ${action.name} has no configuration`);
        }

        return {
          type: "mcp_server_configuration" as const,
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
              ? await processTableSelection(
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
          secretName: action.configuration.secretName,
        };
      },
      { concurrency: 3 }
    );
  } catch (error) {
    datadogLogger.error(
      {
        workspaceId: owner.sId,
        agentConfigurationId,
        actionsCount: mcpActions.length,
        error: normalizeError(error),
      },
      "Failed to process agent actions during form submission"
    );
    return new Err(normalizeError(error));
  }

  const requestBody: PostOrPatchAgentConfigurationRequestBody = {
    assistant: {
      name: formData.agentSettings.name,
      description: formData.agentSettings.description,
      instructions: formData.instructions,
      pictureUrl: pictureUrlToUse,
      status: isDraft ? "draft" : "active",
      scope: formData.agentSettings.scope,
      model: {
        modelId: formData.generationSettings.modelSettings.modelId,
        providerId: formData.generationSettings.modelSettings.providerId,
        temperature: formData.generationSettings.temperature,
        reasoningEffort: formData.generationSettings.reasoningEffort,
        responseFormat: formData.generationSettings.responseFormat,
      },
      actions: processedActions,
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
        datadogLogger.error(
          {
            workspaceId: owner.sId,
            agentConfigurationId,
            endpoint,
            body: requestBody,
            httpStatus: response.status,
            errorMessage: error.error?.message,
          },
          "[Agent builder] - Form submission failed"
        );
        return new Err(
          new Error(error.error?.message || "Failed to save agent")
        );
      } catch {
        datadogLogger.error(
          {
            workspaceId: owner.sId,
            agentConfigurationId,
            body: requestBody,
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

    // Track agent creation (only for new agents, not updates)
    if (!agentConfigurationId && !isDraft) {
      trackEvent({
        area: TRACKING_AREAS.BUILDER,
        object: "create_agent",
        action: TRACKING_ACTIONS.SUBMIT,
        extra: {
          scope: formData.agentSettings.scope,
          has_actions: processedActions.length > 0,
        },
      });
    }

    // We don't update Slack channels nor triggers when saving a draft agent.
    if (isDraft) {
      return new Ok(agentConfiguration);
    }

    const { slackChannels, slackProvider } = formData.agentSettings;
    // If the user selected channels that were already routed to a different agent, the current behavior is to
    // unlink them from the previous agent and link them to this one.
    // Make the call even if slackChannels is empty, since if the user deselects all channels,
    // the call need to be made to unlink them.
    if (slackProvider && areSlackChannelsChanged) {
      const autoRespondWithoutMention =
        slackChannels.length > 0
          ? slackChannels[0].autoRespondWithoutMention
          : false;
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
        try {
          const errorBody = await slackLinkRes.json();

          if (errorBody?.error?.type === "connector_operation_in_progress") {
            datadogLogger.info(
              {
                workspaceId: owner.sId,
                agentConfigurationId: agentConfiguration.sId,
                httpStatus: slackLinkRes.status,
                body: slackRequestBody,
                slackChannelsCount: slackChannels.length,
              },
              "[Agent builder] - Slack channel linking already in progress"
            );
            // For "operation in progress", we consider this a partial success
            // The agent was saved, but the channel linking is still in progress
            // We'll handle this in the UI by showing an informational message
            // Return success with a special marker in the agent configuration
            const agentWithWarning = {
              ...agentConfiguration,
              _warning: "slack_channel_linking_in_progress",
            };
            return new Ok(agentWithWarning as typeof agentConfiguration);
          }
        } catch {
          // If we can't parse the error, fall through to generic error
        }

        datadogLogger.error(
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

    // Process triggers (delete, update, create)
    const triggerResult = await processTriggers({
      formData,
      owner,
      agentConfigurationId: agentConfiguration.sId,
      userId: user.id,
    });
    if (triggerResult.isErr()) {
      return triggerResult;
    }

    return new Ok(agentConfiguration);
  } catch (error) {
    datadogLogger.error(
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
