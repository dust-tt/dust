import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import { AGENT_NAME_MAX_LENGTH } from "@app/types/assistant/agent";
import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/types/assistant/creativity";

// Agent rules shared by the agent builder and conversational building.

export type AgentNameFormatErrorCode = "empty" | "too_long" | "contains_spaces";

// The format rules every agent name follows. Uniqueness is checked separately, server-side.
export function getAgentNameFormatErrorCode(
  name: string
): AgentNameFormatErrorCode | null {
  if (!name) {
    return "empty";
  }
  if (name.length > AGENT_NAME_MAX_LENGTH) {
    return "too_long";
  }
  if (/\s/.test(name)) {
    return "contains_spaces";
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
