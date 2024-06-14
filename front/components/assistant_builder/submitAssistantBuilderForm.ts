import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
  PostOrPatchAgentConfigurationRequestBodySchema,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever, removeNulls } from "@dust-tt/types";
import type * as t from "io-ts";

import type { SlackChannel } from "@app/components/assistant/SlackIntegration";
import { removeLeadingAt } from "@app/components/assistant_builder/NamingScreen";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import { getDefaultAssistantState } from "@app/components/assistant_builder/types";

type SlackChannelLinkedWithAgent = SlackChannel & {
  agentConfigurationId: string;
};

export async function submitAssistantBuilderForm({
  owner,
  builderState,
  agentConfigurationId,
  slackData,
  isDraft,
  useMultiActions,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  agentConfigurationId: string | null;
  slackData: {
    selectedSlackChannels: SlackChannel[];
    slackChannelsLinkedWithAgent: SlackChannelLinkedWithAgent[];
  };
  isDraft?: boolean;
  useMultiActions: boolean;
}): Promise<LightAgentConfigurationType | AgentConfigurationType> {
  const { selectedSlackChannels, slackChannelsLinkedWithAgent } = slackData;
  let { handle, description, instructions, avatarUrl } = builderState;
  if (!handle || !description || !instructions || !avatarUrl) {
    if (!isDraft) {
      // should be unreachable
      // we keep this for TS
      throw new Error("Form not valid");
    } else {
      handle = handle?.trim() || "Preview";
      description = description?.trim() || "Preview";
      instructions = instructions?.trim() || "Preview";
      avatarUrl = avatarUrl ?? "";
    }
  }

  type BodyType = t.TypeOf<
    typeof PostOrPatchAgentConfigurationRequestBodySchema
  >;

  type ActionsType = NonNullable<BodyType["assistant"]["actions"]>;

  const map: (a: AssistantBuilderActionConfiguration) => ActionsType = (a) => {
    switch (a.type) {
      case "RETRIEVAL_SEARCH":
      case "RETRIEVAL_EXHAUSTIVE":
        return [
          {
            type: "retrieval_configuration",
            name: a.name,
            description: a.description,
            query: a.type === "RETRIEVAL_SEARCH" ? "auto" : "none",
            relativeTimeFrame:
              a.type === "RETRIEVAL_EXHAUSTIVE"
                ? {
                    duration: a.configuration.timeFrame.value,
                    unit: a.configuration.timeFrame.unit,
                  }
                : "auto",
            topK: "auto",
            dataSources: Object.values(
              a.configuration.dataSourceConfigurations
            ).map(({ dataSource, selectedResources, isSelectAll }) => ({
              dataSourceId: dataSource.name,
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
                tags: null,
              },
            })),
          },
        ];

      case "DUST_APP_RUN":
        if (!a.configuration.app) {
          return [];
        }
        return [
          {
            type: "dust_app_run_configuration",
            name: a.name,
            description: a.description,
            appWorkspaceId: owner.sId,
            appId: a.configuration.app.sId,
          },
        ];

      case "TABLES_QUERY":
        return [
          {
            type: "tables_query_configuration",
            name: a.name,
            description: a.description,
            tables: Object.values(a.configuration),
          },
        ];

      case "WEB_NAVIGATION":
        return [
          {
            type: "websearch_configuration",
            name: "websearch",
            description: "Perform a web search",
          },
          {
            type: "browse_configuration",
            name: "browse",
            description: "Browse the content of a web page",
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
            ).map(({ dataSource, selectedResources, isSelectAll }) => ({
              dataSourceId: dataSource.name,
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
                tags: null,
              },
            })),
            tagsFilter: a.configuration.tagsFilter,
            relativeTimeFrame: {
              duration: a.configuration.timeFrame.value,
              unit: a.configuration.timeFrame.unit,
            },
            schema: a.configuration.schema,
          },
        ];

      default:
        assertNever(a);
    }
  };

  const actionParams: ActionsType = builderState.actions.flatMap(map);

  const body: t.TypeOf<typeof PostOrPatchAgentConfigurationRequestBodySchema> =
    {
      assistant: {
        name: removeLeadingAt(handle),
        pictureUrl: avatarUrl,
        description: description,
        instructions: instructions.trim(),
        status: isDraft ? "draft" : "active",
        scope: builderState.scope,
        actions: useMultiActions
          ? actionParams
          : removeNulls([actionParams[0]]),
        model: {
          modelId: builderState.generationSettings.modelSettings.modelId,
          providerId: builderState.generationSettings.modelSettings.providerId,
          temperature: builderState.generationSettings.temperature,
        },
        maxToolsUsePerRun: useMultiActions
          ? builderState.maxToolsUsePerRun ??
            getDefaultAssistantState().maxToolsUsePerRun
          : undefined,
        templateId: builderState.templateId,
      },
      useMultiActions,
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
    throw new Error("An error occurred while saving the configuration.");
  }

  const newAgentConfiguration: {
    agentConfiguration: LightAgentConfigurationType | AgentConfigurationType;
  } = await res.json();
  const agentConfigurationSid = newAgentConfiguration.agentConfiguration.sId;

  // PATCH the linked slack channels if either:
  // - there were already linked channels
  // - there are newly selected channels
  // If the user selected channels that were already routed to a different assistant, the current behavior is to
  // unlink them from the previous assistant and link them to the this one.
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
          slack_channel_ids: selectedSlackChannels.map(
            ({ slackChannelId }) => slackChannelId
          ),
        }),
      }
    );

    if (!slackLinkRes.ok) {
      throw new Error("An error occurred while linking Slack channels.");
    }
  }

  return newAgentConfiguration.agentConfiguration;
}
