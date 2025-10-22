import uniqueId from "lodash/uniqueId";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/components/agent_builder/types";
import type { AssistantBuilderMCPConfiguration } from "@app/components/assistant_builder/types";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/templates/[tId]";
import type {
  LightAgentConfigurationType,
  UserType,
  WorkspaceType,
} from "@app/types";
import {
  CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG,
  getLargeWhitelistedModel,
  isProviderWhitelisted,
} from "@app/types";

/**
 * Transforms a light agent configuration (server-side) into agent builder form data (client-side).
 * Dynamic values (editors, slackProvider, actions) are intentionally set to empty defaults
 * as they will be populated reactively in the component.
 */
export function transformAgentConfigurationToFormData(
  agentConfiguration: LightAgentConfigurationType
): AgentBuilderFormData {
  return {
    agentSettings: {
      name: agentConfiguration.name,
      description: agentConfiguration.description,
      pictureUrl: agentConfiguration.pictureUrl,
      scope:
        agentConfiguration.scope === "global"
          ? "visible"
          : agentConfiguration.scope,
      editors: [], // Will be populated reactively from useEditors hook
      slackProvider: null, // Will be populated reactively from supportedDataSourceViews
      slackChannels: [], // Will be populated reactively if needed
      tags: agentConfiguration.tags,
    },
    instructions: agentConfiguration.instructions ?? "",
    generationSettings: {
      modelSettings: {
        modelId: agentConfiguration.model.modelId,
        providerId: agentConfiguration.model.providerId,
      },
      temperature: agentConfiguration.model.temperature,
      reasoningEffort: agentConfiguration.model.reasoningEffort ?? "none",
      responseFormat: agentConfiguration.model.responseFormat,
    },
    actions: [], // Will be populated reactively from useAgentConfigurationActions hook
    triggersToCreate: [],
    triggersToUpdate: [], // Will be populated reactively from the hook
    triggersToDelete: [],
    maxStepsPerRun: agentConfiguration.maxStepsPerRun || 8,
  };
}

export function getDefaultAgentFormData({
  user,
  owner,
}: {
  user: UserType;
  owner: WorkspaceType;
}): AgentBuilderFormData {
  const preferredModel = CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG;
  const fallbackModel = getLargeWhitelistedModel(owner);

  // We use the preferred model unless the provider is deactivated for the workspace but we have a fallback model.
  // (We have no fallback model if all providers are deactivated which can be done in the workspace settings).
  const modelConfiguration =
    !isProviderWhitelisted(owner, preferredModel.providerId) && fallbackModel
      ? fallbackModel
      : preferredModel;

  return {
    agentSettings: {
      name: "",
      description: "",
      pictureUrl: undefined,
      scope: "hidden",
      editors: [user],
      slackProvider: null,
      slackChannels: [],
      tags: [],
    },
    instructions: "",
    generationSettings: {
      modelSettings: {
        modelId: modelConfiguration.modelId,
        providerId: modelConfiguration.providerId,
      },
      temperature: 0.7,
      reasoningEffort: modelConfiguration.defaultReasoningEffort,
      responseFormat: undefined,
    },
    actions: [],
    triggersToCreate: [],
    triggersToUpdate: [],
    triggersToDelete: [],
    maxStepsPerRun: 8,
  };
}

/**
 * Transforms an assistant template into agent builder form data with defaults.
 * Merges template presets with default form data to create a complete configuration.
 */
export function transformTemplateToFormData(
  template: FetchAssistantTemplateResponse,
  user: UserType,
  owner: WorkspaceType
): AgentBuilderFormData {
  const defaultFormData = getDefaultAgentFormData({ user, owner });

  return {
    ...defaultFormData,
    instructions: template.presetInstructions ?? defaultFormData.instructions,
    agentSettings: {
      ...defaultFormData.agentSettings,
      name: template.handle ?? defaultFormData.agentSettings.name,
      description:
        template.description ?? defaultFormData.agentSettings.description,
      pictureUrl:
        template.pictureUrl ?? defaultFormData.agentSettings.pictureUrl,
    },
    generationSettings: {
      ...defaultFormData.generationSettings,
      modelSettings: {
        providerId:
          template.presetProviderId ??
          defaultFormData.generationSettings.modelSettings.providerId,
        modelId:
          template.presetModelId ??
          defaultFormData.generationSettings.modelSettings.modelId,
      },
      temperature: template.presetTemperature
        ? AGENT_CREATIVITY_LEVEL_TEMPERATURES[template.presetTemperature]
        : defaultFormData.generationSettings.temperature,
    },
    actions: [],
    triggersToCreate: [],
    triggersToUpdate: [],
    triggersToDelete: [],
  };
}

/**
 * Converts AssistantBuilderMCPConfiguration actions to AgentBuilderFormData actions format.
 * Used for YAML export to include actions that are normally loaded client-side.
 * Generates unique IDs since they're only needed for UI purposes.
 */
export function convertActionsForFormData(
  actions: AssistantBuilderMCPConfiguration[]
): AgentBuilderFormData["actions"] {
  return actions.map((action) => ({
    id: uniqueId(),
    name: action.name,
    description: action.description,
    type: "MCP",
    configuration: action.configuration,
    secretName: action.configuration.secretName,
  }));
}

/**
 * Transforms an agent configuration for duplication into agent builder form data.
 * Similar to transformAgentConfigurationToFormData but adds "_Copy" suffix to name,
 * resets editors to current user, and defaults to private scope.
 */
export function transformDuplicateAgentToFormData(
  agentConfiguration: LightAgentConfigurationType,
  user: UserType
): AgentBuilderFormData {
  const baseFormData =
    transformAgentConfigurationToFormData(agentConfiguration);

  return {
    ...baseFormData,
    agentSettings: {
      ...baseFormData.agentSettings,
      name: `${agentConfiguration.name}${
        "isTemplate" in agentConfiguration ? "" : "_Copy"
      }`,
      scope: "hidden", // Default duplicated agents to private scope
      editors: [user], // Reset editors to current user for duplicated agent
      tags: agentConfiguration.tags.filter((tag) => tag.kind !== "protected"),
    },
  };
}
