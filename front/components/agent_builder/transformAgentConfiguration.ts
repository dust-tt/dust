import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { UserType } from "@app/types";
import type { LightAgentConfigurationType } from "@app/types";
import { CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG } from "@app/types";

/**
 * Transforms a light agent configuration (server-side) into agent builder form data (client-side).
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
      editors: [], // Fallback - editors will be updated reactively
      slackProvider: null, // TODO: determine from agent configuration
      slackChannels: [], // TODO: determine from agent configuration
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
    actions: [], // Actions are always loaded client-side via SWR
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
