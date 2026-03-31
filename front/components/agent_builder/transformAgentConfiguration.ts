import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { AgentBuilderMCPConfiguration } from "@app/components/agent_builder/types";
import type { FetchAgentTemplateResponse } from "@app/pages/api/templates/[tId]";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/types/assistant/creativity";
import {
  CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
  CLAUDE_SONNET_4_6_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import { GEMINI_3_PRO_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import { MISTRAL_LARGE_MODEL_ID } from "@app/types/assistant/models/mistral";
import { GPT_5_4_MODEL_ID } from "@app/types/assistant/models/openai";
import type {
  ModelConfigurationType,
  ModelIdType,
} from "@app/types/assistant/models/types";
import { GROK_4_MODEL_ID } from "@app/types/assistant/models/xai";
import type { UserType } from "@app/types/user";
import uniqueId from "lodash/uniqueId";

/**
 * Transforms a light agent configuration (server-side) into agent builder form data (client-side).
 * Dynamic values (editors, slackProvider, actions) are intentionally set to empty defaults
 * as they will be populated reactively in the component.
 */
export function transformAgentConfigurationToFormData(
  agentConfiguration: AgentConfigurationType
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
    instructionsHtml: agentConfiguration.instructionsHtml ?? undefined,
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
    skills: [], // Will be populated reactively from useAgentConfigurationSkills hook
    additionalSpaces: [], // Will be populated reactively if needed
    triggersToCreate: [],
    triggersToUpdate: [], // Will be populated reactively from the hook
    triggersToDelete: [],
    maxStepsPerRun: agentConfiguration.maxStepsPerRun || 8,
  };
}

const PREFERRED_LARGE_MODEL_IDS: ModelIdType[] = [
  CLAUDE_SONNET_4_6_MODEL_ID,
  GPT_5_4_MODEL_ID,
  GEMINI_3_PRO_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
  GROK_4_MODEL_ID,
];

export function getDefaultLargeModel(
  availableModels: ModelConfigurationType[]
): ModelConfigurationType {
  for (const modelId of PREFERRED_LARGE_MODEL_IDS) {
    const model = availableModels.find((m) => m.modelId === modelId);
    if (model) {
      return model;
    }
  }

  const fallbackModel = availableModels.find((m) => m.largeModel);

  return fallbackModel ?? CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG;
}

export function getDefaultAgentFormData({
  user,
}: {
  user: UserType;
}): AgentBuilderFormData {
  // Static fallback — overridden by the useEffect in AgentBuilder once available
  // models are loaded.
  const defaultModel = CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG;

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
        modelId: defaultModel.modelId,
        providerId: defaultModel.providerId,
      },
      temperature: 0.7,
      reasoningEffort: defaultModel.defaultReasoningEffort,
      responseFormat: undefined,
    },
    actions: [],
    skills: [],
    additionalSpaces: [],
    triggersToCreate: [],
    triggersToUpdate: [],
    triggersToDelete: [],
    maxStepsPerRun: 8,
  };
}

/**
 * Transforms an agent template into agent builder form data with defaults.
 * Merges template presets with default form data to create a complete configuration.
 */
export function transformTemplateToFormData(
  template: FetchAgentTemplateResponse,
  user: UserType
): AgentBuilderFormData {
  const defaultFormData = getDefaultAgentFormData({
    user,
  });

  return {
    ...defaultFormData,
    agentSettings: {
      ...defaultFormData.agentSettings,
      description:
        template.userFacingDescription ??
        defaultFormData.agentSettings.description,
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
    skills: [],
    additionalSpaces: [],
    triggersToCreate: [],
    triggersToUpdate: [],
    triggersToDelete: [],
  };
}

/**
 * Converts AgentBuilderMCPConfiguration actions to AgentBuilderFormData actions format.
 * Used for YAML export to include actions that are normally loaded client-side.
 * Generates unique IDs since they're only needed for UI purposes.
 */
export function convertActionsForFormData(
  actions: AgentBuilderMCPConfiguration[]
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
  agentConfiguration: AgentConfigurationType,
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
