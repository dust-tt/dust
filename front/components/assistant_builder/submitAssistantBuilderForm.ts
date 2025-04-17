import { isLegacyAssistantBuilderConfiguration } from "@app/components/assistant_builder/legacy_agent";
import { removeLeadingAt } from "@app/components/assistant_builder/NamingScreen";
import { getTableIdForContentNode } from "@app/components/assistant_builder/shared";
import type { SlackChannel } from "@app/components/assistant_builder/SlackIntegration";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import {
  DEFAULT_BROWSE_ACTION_DESCRIPTION,
  DEFAULT_BROWSE_ACTION_NAME,
  DEFAULT_REASONING_ACTION_DESCRIPTION,
  DEFAULT_REASONING_ACTION_NAME,
  DEFAULT_WEBSEARCH_ACTION_DESCRIPTION,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/actions/constants";
import type {
  DataSourceConfiguration,
  RetrievalTimeframe,
} from "@app/lib/actions/retrieval";
import type { TableDataSourceConfiguration } from "@app/lib/actions/tables_query";
import type {
  AgentConfigurationType,
  DataSourceViewSelectionConfigurations,
  LightAgentConfigurationType,
  ModelConfigurationType,
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
  reasoningModels,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  agentConfigurationId: string | null;
  slackData: {
    selectedSlackChannels: SlackChannel[];
    slackChannelsLinkedWithAgent: SlackChannelLinkedWithAgent[];
  };
  isDraft?: boolean;
  reasoningModels: ModelConfigurationType[];
}): Promise<
  Result<LightAgentConfigurationType | AgentConfigurationType, Error>
> {
  const { selectedSlackChannels, slackChannelsLinkedWithAgent } = slackData;
  let { handle, description, instructions, avatarUrl } = builderState;
  if (!handle || !description || !instructions || !avatarUrl) {
    if (!isDraft) {
      // Should be unreachable, we keep this for TS
      throw new Error("Form not valid (unreachable)");
    } else {
      handle = handle?.trim() || "Preview";
      description = description?.trim() || "Preview";
      instructions = instructions?.trim() || "Preview";
      avatarUrl = avatarUrl ?? "";
    }
  }

  type ActionsType = NonNullable<
    PostOrPatchAgentConfigurationRequestBody["assistant"]["actions"]
  >;

  const map: (a: AssistantBuilderActionConfiguration) => ActionsType = (a) => {
    let timeFrame: RetrievalTimeframe = "auto";

    if (a.type === "RETRIEVAL_EXHAUSTIVE") {
      if (a.configuration.timeFrame) {
        timeFrame = {
          duration: a.configuration.timeFrame.value,
          unit: a.configuration.timeFrame.unit,
        };
      } else {
        timeFrame = "none";
      }
    } else if (a.type === "PROCESS") {
      if (a.configuration.timeFrame) {
        timeFrame = {
          duration: a.configuration.timeFrame.value,
          unit: a.configuration.timeFrame.unit,
        };
      }
    }

    switch (a.type) {
      case "RETRIEVAL_SEARCH":
      case "RETRIEVAL_EXHAUSTIVE":
        return [
          {
            type: "retrieval_configuration",
            name: a.name,
            description: a.description,
            query: a.type === "RETRIEVAL_SEARCH" ? "auto" : "none",
            relativeTimeFrame: timeFrame,
            topK: "auto",
            dataSources: processDataSourcesSelection({
              owner,
              dataSourceConfigurations:
                a.configuration.dataSourceConfigurations,
            }),
          },
        ];

      case "DUST_APP_RUN":
        if (!a.configuration.app) {
          return [];
        }
        return [
          {
            type: "dust_app_run_configuration",
            appWorkspaceId: owner.sId,
            appId: a.configuration.app.sId,
            // These fields are required by the API (`name` and `description`)
            // but will be overridden with the app name and description.
            name: a.configuration.app.name,
            description: a.configuration.app.description,
          },
        ];

      case "TABLES_QUERY":
        return [
          {
            type: "tables_query_configuration",
            name: a.name,
            description: a.description,
            tables: processTableSelection({
              owner,
              tablesConfigurations: a.configuration,
            }),
          },
        ];

      case "WEB_NAVIGATION":
        return [
          {
            type: "websearch_configuration",
            name: DEFAULT_WEBSEARCH_ACTION_NAME,
            description: DEFAULT_WEBSEARCH_ACTION_DESCRIPTION,
          },
          {
            type: "browse_configuration",
            name: DEFAULT_BROWSE_ACTION_NAME,
            description: DEFAULT_BROWSE_ACTION_DESCRIPTION,
          },
        ];

      case "MCP":
        const {
          configuration: {
            tablesConfigurations,
            dataSourceConfigurations,
            childAgentId,
            additionalConfiguration,
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
            additionalConfiguration,
          },
        ];

      case "PROCESS":
        return [
          {
            type: "process_configuration",
            name: a.name,
            description: a.description,
            dataSources: Object.values(
              a.configuration.dataSourceConfigurations
            ).map(
              ({
                dataSourceView,
                selectedResources,
                isSelectAll,
                tagsFilter,
              }) => ({
                dataSourceViewId: dataSourceView.sId,
                workspaceId: owner.sId,
                filter: {
                  parents: !isSelectAll
                    ? {
                        in: selectedResources.map(
                          (resource) => resource.internalId
                        ),
                        not: [],
                      }
                    : null,
                  tags: tagsFilter,
                },
              })
            ),
            tagsFilter: a.configuration.tagsFilter,
            relativeTimeFrame: timeFrame,
            schema: a.configuration.schema
              ? JSON.parse(a.configuration.schema)
              : null,
          },
        ];

      case "REASONING":
        // User doesn't have any reasoning models available.
        if (!reasoningModels.length) {
          return [];
        }

        const selectedSupportedReasoningModel = reasoningModels.find(
          (m) =>
            m.modelId === a.configuration.modelId &&
            m.providerId === a.configuration.providerId &&
            (m.reasoningEffort ?? null) ===
              (a.configuration.reasoningEffort ?? null)
        );

        // If the selected model is no longer available, we switch to the first available model.
        const reasoningModel =
          selectedSupportedReasoningModel || reasoningModels[0];

        return [
          {
            type: "reasoning_configuration",
            name: DEFAULT_REASONING_ACTION_NAME,
            description: DEFAULT_REASONING_ACTION_DESCRIPTION,
            modelId: reasoningModel.modelId,
            providerId: reasoningModel.providerId,
            temperature: a.configuration.temperature,
            reasoningEffort: reasoningModel.reasoningEffort ?? null,
          },
        ];

      default:
        assertNever(a);
    }
  };

  const actionParams: ActionsType = builderState.actions.flatMap(map);

  const isLegacyAgent = isLegacyAssistantBuilderConfiguration(builderState);
  const maxStepsPerRun = isLegacyAgent
    ? undefined
    : builderState.maxStepsPerRun ?? undefined;

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
        reasoningEffort:
          builderState.generationSettings.modelSettings.reasoningEffort,
        responseFormat: builderState.generationSettings.responseFormat,
      },
      maxStepsPerRun,
      visualizationEnabled: builderState.visualizationEnabled,
      templateId: builderState.templateId,
      tags: builderState.tags,
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
