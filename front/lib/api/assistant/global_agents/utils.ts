import { GPT_4_1_MODEL_CONFIG } from "@app/types/assistant/models/openai";

// Used when returning an agent with status 'disabled_by_admin'
export const dummyModelConfiguration = {
  providerId: GPT_4_1_MODEL_CONFIG.providerId,
  modelId: GPT_4_1_MODEL_CONFIG.modelId,
  temperature: 0,
  reasoningEffort: GPT_4_1_MODEL_CONFIG.defaultReasoningEffort,
};
