import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { AgentBuilderMCPConfiguration } from "@app/components/agent_builder/types";
import type { FetchAgentTemplateResponse } from "@app/pages/api/templates/[tId]";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/types/assistant/creativity";
import {
  CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";
import {
  GEMINI_3_FLASH_MODEL_CONFIG,
  GEMINI_3_PRO_MODEL_CONFIG,
} from "@app/types/assistant/models/google_ai_studio";
import {
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
} from "@app/types/assistant/models/mistral";
import {
  GPT_5_4_MODEL_CONFIG,
  GPT_5_MINI_MODEL_CONFIG,
} from "@app/types/assistant/models/openai";
import { MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import {
  GROK_4_1_FAST_NON_REASONING_MODEL_CONFIG,
  GROK_4_MODEL_CONFIG,
} from "@app/types/assistant/models/xai";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { UserType, WorkspaceType } from "@app/types/user";
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

function isProviderWhitelistedSync(
  owner: WorkspaceType,
  providerId: ModelProviderIdType
): boolean {
  if (providerId === "noop") {
    return true;
  }
  const whiteListedProviders = owner.whiteListedProviders ?? MODEL_PROVIDER_IDS;
  return whiteListedProviders.includes(providerId);
}

function getSmallWhitelistedModelSync(
  owner: WorkspaceType
): ModelConfigurationType | null {
  if (isProviderWhitelistedSync(owner, "openai")) {
    return GPT_5_MINI_MODEL_CONFIG;
  }
  if (isProviderWhitelistedSync(owner, "anthropic")) {
    return CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelistedSync(owner, "google_ai_studio")) {
    return GEMINI_3_FLASH_MODEL_CONFIG;
  }
  if (isProviderWhitelistedSync(owner, "mistral")) {
    return MISTRAL_SMALL_MODEL_CONFIG;
  }
  if (isProviderWhitelistedSync(owner, "xai")) {
    return GROK_4_1_FAST_NON_REASONING_MODEL_CONFIG;
  }
  return null;
}

function getLargeWhitelistedModelSync(
  owner: WorkspaceType
): ModelConfigurationType | null {
  if (isProviderWhitelistedSync(owner, "anthropic")) {
    return CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelistedSync(owner, "openai")) {
    return GPT_5_4_MODEL_CONFIG;
  }
  if (isProviderWhitelistedSync(owner, "google_ai_studio")) {
    return GEMINI_3_PRO_MODEL_CONFIG;
  }
  if (isProviderWhitelistedSync(owner, "mistral")) {
    return MISTRAL_LARGE_MODEL_CONFIG;
  }
  if (isProviderWhitelistedSync(owner, "xai")) {
    return GROK_4_MODEL_CONFIG;
  }
  return null;
}

export function getDefaultAgentFormData({
  user,
  owner,
  hasSidekick,
}: {
  user: UserType;
  owner: WorkspaceType;
  hasSidekick?: boolean;
}): AgentBuilderFormData {
  const preferredModel = hasSidekick
    ? CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG
    : CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG;
  const fallbackModel = hasSidekick
    ? getSmallWhitelistedModelSync(owner)
    : getLargeWhitelistedModelSync(owner);

  // We use the preferred model unless the provider is deactivated for the workspace but we have a fallback model.
  // (We have no fallback model if all providers are deactivated which can be done in the workspace settings).
  const modelConfiguration =
    !isProviderWhitelistedSync(owner, preferredModel.providerId) &&
    fallbackModel
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
  user: UserType,
  owner: WorkspaceType,
  hasFeature: (flag: WhitelistableFeature | null | undefined) => boolean
): AgentBuilderFormData {
  const hasSidekickAccess =
    hasFeature("agent_builder_copilot") &&
    (owner.role === "admin" ||
      (hasFeature("agent_builder_copilot_builders") &&
        owner.role === "builder"));
  const defaultFormData = getDefaultAgentFormData({
    user,
    owner,
    hasSidekick: hasSidekickAccess,
  });

  return {
    ...defaultFormData,
    // Don't constrain sidekick with preset instructions when the user has sidekick access.
    instructions: hasSidekickAccess
      ? defaultFormData.instructions
      : (template.presetInstructions ?? defaultFormData.instructions),
    agentSettings: {
      ...defaultFormData.agentSettings,
      name: hasSidekickAccess
        ? defaultFormData.agentSettings.name
        : (template.handle ?? defaultFormData.agentSettings.name),
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
