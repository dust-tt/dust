import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/components/agent_builder/types";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/templates/[tId]";
import type { UserType } from "@app/types";
import type { LightAgentConfigurationType } from "@app/types";
import { CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG } from "@app/types";

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
    instructions: agentConfiguration.instructions || "",
    generationSettings: {
      modelSettings: {
        modelId: agentConfiguration.model.modelId,
        providerId: agentConfiguration.model.providerId,
      },
      temperature: agentConfiguration.model.temperature,
      reasoningEffort: agentConfiguration.model.reasoningEffort || "none",
      responseFormat: agentConfiguration.model.responseFormat,
    },
    actions: [], // Will be populated reactively from useAgentConfigurationActions hook
    maxStepsPerRun: agentConfiguration.maxStepsPerRun || 8,
  };
}

export function getDefaultAgentFormData(user: UserType): AgentBuilderFormData {
  return {
    agentSettings: {
      name: "",
      description: "",
      pictureUrl: "",
      scope: "hidden",
      editors: [user],
      slackProvider: null,
      slackChannels: [],
      tags: [],
    },
    instructions: "",
    generationSettings: {
      modelSettings: {
        modelId: CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.modelId,
        providerId: CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.providerId,
      },
      temperature: 0.7,
      reasoningEffort:
        CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
      responseFormat: undefined,
    },
    actions: [],
    maxStepsPerRun: 8,
  };
}

/**
 * Transforms an assistant template into agent builder form data with defaults.
 * Merges template presets with default form data to create a complete configuration.
 */
export function transformTemplateToFormData(
  template: FetchAssistantTemplateResponse,
  user: UserType
): AgentBuilderFormData {
  const defaultFormData = getDefaultAgentFormData(user);

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
  };
}
