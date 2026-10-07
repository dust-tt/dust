import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import { AGENT_NAME_MAX_LENGTH } from "@app/types/assistant/agent";
import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/types/assistant/creativity";

// Agent rules shared by the agent builder and conversational building.

// The format rules every agent name follows. Uniqueness is checked separately, server-side.
export function getAgentNameFormatError(name: string): string | null {
  if (!name) {
    return "Agent name cannot be empty.";
  }
  if (name.length > AGENT_NAME_MAX_LENGTH) {
    return `Agent name must be at most ${AGENT_NAME_MAX_LENGTH} characters.`;
  }
  if (/\s/.test(name)) {
    return "Agent name cannot contain spaces.";
  }
  return null;
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
