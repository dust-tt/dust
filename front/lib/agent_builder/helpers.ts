import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/types/assistant/creativity";

// Agent rules shared by the agent builder and conversational building.

// The format rules every agent name follows. Uniqueness is checked separately, server-side.
export function getAgentNameFormatError(name: string): string | null {
  if (!name) {
    return "Agent name cannot be empty.";
  }
  if (/\s/.test(name)) {
    return "Agent name cannot contain spaces.";
  }
  return null;
}

export function getAgentScopeLabel(scope: AgentConfigurationScope): string {
  return scope === "visible" ? "Published" : "Unpublished";
}

// The model settings a new agent starts with, whichever flow creates it.
export function getNewAgentModelDefaults(
  defaultModel: Pick<
    EnabledModelConfigurationType,
    "providerId" | "modelId" | "defaultReasoningEffort"
  >
) {
  return {
    providerId: defaultModel.providerId,
    modelId: defaultModel.modelId,
    temperature: AGENT_CREATIVITY_LEVEL_TEMPERATURES.balanced,
    reasoningEffort: defaultModel.defaultReasoningEffort,
  };
}
