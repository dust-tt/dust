import type { ConnectorProvider } from "@dust-tt/client";

import { removeLeadingAt } from "@app/components/assistant_builder/SettingsScreen";
import { getTableIdForContentNode } from "@app/components/assistant_builder/shared";
import type { SlackChannel } from "@app/components/assistant_builder/SlackIntegration";
import type {
  AssistantBuilderActionAndDataVisualizationConfiguration,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import type { TableDataSourceConfiguration } from "@app/lib/api/assistant/configuration";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration";
import type {
  AgentConfigurationType,
  DataSourceViewSelectionConfigurations,
  LightAgentConfigurationType,
  PostOrPatchAgentConfigurationRequestBody,
  Result,
  WorkspaceType,
} from "@app/types";
import { assertNever, Err, Ok } from "@app/types";

type SlackChannelLinkedWithAgent = SlackChannel & {
  agentConfigurationId: string;
};

function processDataSourcesSelection({
  owner,
  dataSourceConfigurations,
}: {
  owner: WorkspaceType;
  dataSourceConfigurations: DataSourceViewSelectionConfigurations;
}): DataSourceConfiguration[] {
  return Object.values(dataSourceConfigurations).map(
    ({ dataSourceView, selectedResources, isSelectAll, tagsFilter }) => ({
      dataSourceViewId: dataSourceView.sId,
      workspaceId: owner.sId,
      filter: {
        parents: !isSelectAll
          ? {
              in: selectedResources.map((resource) => resource.internalId),
              not: [],
            }
          : null,
        tags: tagsFilter,
      },
    })
  );
}

function processTableSelection({
  owner,
  tablesConfigurations,
}: {
  owner: WorkspaceType;
  tablesConfigurations: DataSourceViewSelectionConfigurations;
}): TableDataSourceConfiguration[] {
  return Object.values(tablesConfigurations).flatMap(
    ({ dataSourceView, selectedResources }) => {
      return selectedResources.map((resource) => ({
        dataSourceViewId: dataSourceView.sId,
        workspaceId: owner.sId,
        tableId: getTableIdForContentNode(dataSourceView.dataSource, resource),
      }));
    }
  );
}

export async function submitAssistantBuilderForm({
  owner,
  builderState,
  agentConfigurationId,
  slackData,
  isDraft,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  agentConfigurationId: string | null;
  slackData: {
    provider: Extract<ConnectorProvider, "slack" | "slack_bot">;
    selectedSlackChannels: SlackChannel[];
    slackChannelsLinkedWithAgent: SlackChannelLinkedWithAgent[];
  };
  isDraft?: boolean;
}): Promise<
  Result<LightAgentConfigurationType | AgentConfigurationType, Error>
> {
  const { provider, selectedSlackChannels, slackChannelsLinkedWithAgent } =
    slackData;
  let { handle, description, instructions, avatarUrl, editors } = builderState;
  if (!handle || !description || !instructions || !avatarUrl || !editors) {
    if (!isDraft) {
      // Should be unreachable, we keep this for TS
      throw new Error("Form not valid (unreachable)");
    } else {
      handle = handle?.trim() || "Preview";
      description = description?.trim() || "Preview";
      instructions = instructions?.trim() || "Preview";
      avatarUrl = avatarUrl ?? "";
      editors = [];
    }
  }

  type ActionsType = NonNullable<
    PostOrPatchAgentConfigurationRequestBody["assistant"]["actions"]
  >;

  const map: (
    a: AssistantBuilderActionAndDataVisualizationConfiguration
  ) => ActionsType = (a) => {
    switch (a.type) {
      case "MCP":
        const {
          configuration: {
            tablesConfigurations,
            dataSourceConfigurations,
            childAgentId,
            reasoningModel: mcpReasoningModel,
            additionalConfiguration,
            dustAppConfiguration,
            timeFrame,
            jsonSchema,
          },
        } = a;

        return [
          {
            type: "mcp_server_configuration",
            name: a.name,
            description: a.description,
            mcpServerViewId: a.configuration.mcpServerViewId,
            dataSources: dataSourceConfigurations
              ? processDataSourcesSelection({ owner, dataSourceConfigurations })
              : null,
            tables: tablesConfigurations
              ? processTableSelection({ owner, tablesConfigurations })
              : null,
            childAgentId,
            reasoningModel: mcpReasoningModel
              ? {
                  providerId: mcpReasoningModel.providerId,
                  reasoningEffort: mcpReasoningModel.reasoningEffort ?? null,
                  modelId: mcpReasoningModel.modelId,
                }
              : null,
            timeFrame,
            additionalConfiguration,
            dustAppConfiguration,
            jsonSchema,
          },
        ];

      // Data visaulization is boolean value (visualizationEnabled), but in UI we display it
      // like an action. We need to remove it before sending the request to the API.
      case "DATA_VISUALIZATION":
        return [];

      default:
        assertNever(a);
    }
  };

  const actionParams: ActionsType = builderState.actions.flatMap(map);

  const body: PostOrPatchAgentConfigurationRequestBody = {
    assistant: {
      name: removeLeadingAt(handle),
      pictureUrl: avatarUrl,
      description: description,
      instructions: instructions.trim(),
      status: isDraft ? "draft" : "active",
      scope: builderState.scope,
      actions: actionParams,
      model: {
        modelId: builderState.generationSettings.modelSettings.modelId,
        providerId: builderState.generationSettings.modelSettings.providerId,
        temperature: builderState.generationSettings.temperature,
        reasoningEffort: builderState.generationSettings.reasoningEffort,
        responseFormat: builderState.generationSettings.responseFormat,
      },
      visualizationEnabled: builderState.visualizationEnabled,
      templateId: builderState.templateId,
      tags: builderState.tags,
      editors: editors.map((e) => ({ sId: e.sId })),
    },
  };

  const res = await fetch(
    !agentConfigurationId
      ? `/api/w/${owner.sId}/assistant/agent_configurations`
      : `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}`,
    {
      method: !agentConfigurationId ? "POST" : "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    try {
      const error = await res.json();
      return new Err(new Error(error.error.message));
    } catch (e) {
      return new Err(
        new Error("An error occurred while saving the configuration.")
      );
    }
  }

  const newAgentConfiguration: {
    agentConfiguration: LightAgentConfigurationType | AgentConfigurationType;
  } = await res.json();
  const agentConfigurationSid = newAgentConfiguration.agentConfiguration.sId;

  // PATCH the linked Slack channels if either:
  // - there were already linked channels
  // - there are newly selected channels
  // If the user selected channels that were already routed to a different agent, the current behavior is to
  // unlink them from the previous agent and link them to this one.
  if (
    selectedSlackChannels.length ||
    slackChannelsLinkedWithAgent.filter(
      (channel) => channel.agentConfigurationId === agentConfigurationId
    ).length
  ) {
    const slackLinkRes = await fetch(
      `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationSid}/linked_slack_channels`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          slack_channel_internal_ids: selectedSlackChannels.map(
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

  return new Ok(newAgentConfiguration.agentConfiguration);
}
