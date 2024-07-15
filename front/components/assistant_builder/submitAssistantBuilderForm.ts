import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
  PostOrPatchAgentConfigurationRequestBodySchema,
  Result,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever, Err, Ok } from "@dust-tt/types";
import type * as t from "io-ts";

import type { SlackChannel } from "@app/components/assistant/SlackIntegration";
import { isLegacyAssistantBuilderConfiguration } from "@app/components/assistant_builder/legacy_agent";
import { removeLeadingAt } from "@app/components/assistant_builder/NamingScreen";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import {
  DEFAULT_BROWSE_ACTION_NAME,
  DEFAULT_VISUALIZATION_ACTION_NAME,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/api/assistant/actions/names";

type SlackChannelLinkedWithAgent = SlackChannel & {
  agentConfigurationId: string;
};

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
    selectedSlackChannels: SlackChannel[];
    slackChannelsLinkedWithAgent: SlackChannelLinkedWithAgent[];
  };
  isDraft?: boolean;
}): Promise<
  Result<LightAgentConfigurationType | AgentConfigurationType, Error>
> {
  const { selectedSlackChannels, slackChannelsLinkedWithAgent } = slackData;
  let { handle, description, instructions, avatarUrl } = builderState;
  if (!handle || !description || !instructions || !avatarUrl) {
    if (!isDraft) {
      // Should be unreachable we keep this for TS
      throw new Error("Form not valid (unreachable)");
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
            appWorkspaceId: owner.sId,
            appId: a.configuration.app.sId,
            // These field are required by the API (`name` and `description`) but will be overriden
            // with the app name and description.
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
            tables: Object.values(a.configuration),
          },
        ];

      case "WEB_NAVIGATION":
        return [
          {
            type: "websearch_configuration",
            name: DEFAULT_WEBSEARCH_ACTION_NAME,
            description: "Perform a web search",
          },
          {
            type: "browse_configuration",
            name: DEFAULT_BROWSE_ACTION_NAME,
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

      case "VISUALIZATION":
        return [
          {
            type: "visualization_configuration",
            name: DEFAULT_VISUALIZATION_ACTION_NAME,
            description: "Generates graphs from data.",
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

  const body: t.TypeOf<typeof PostOrPatchAgentConfigurationRequestBodySchema> =
    {
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
        },
        maxStepsPerRun,
        templateId: builderState.templateId,
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
      return new Err(
        new Error("An error occurred while linking Slack channels.")
      );
    }
  }

  return new Ok(newAgentConfiguration.agentConfiguration);
}
