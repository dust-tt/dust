import { GPT_5_NANO_MODEL_CONFIG } from "@app/types/assistant/models/openai";

// Used when returning an agent with status 'disabled_by_admin'
export const dummyModelConfiguration = {
  providerId: GPT_5_NANO_MODEL_CONFIG.providerId,
  modelId: GPT_5_NANO_MODEL_CONFIG.modelId,
  temperature: 0,
  reasoningEffort: GPT_5_NANO_MODEL_CONFIG.minimumReasoningEffort,
};
