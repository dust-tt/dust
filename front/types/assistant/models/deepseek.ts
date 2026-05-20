import type { ModelConfigurationType } from "./types";

export const DEEPSEEK_CHAT_MODEL_ID = "deepseek-chat" as const;
export const DEEPSEEK_REASONER_MODEL_ID = "deepseek-reasoner" as const;
export const DEEPSEEK_CHAT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "deepseek",
  modelId: DEEPSEEK_CHAT_MODEL_ID,
  displayName: "DeepSeek",
  contextSize: 64_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "DeepSeek's best model (v3, 64k context).",
  shortDescription: "DeepSeek's best model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  availableIfOneOf: {
    featureFlag: "deepseek_feature",
  },
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
export const DEEPSEEK_REASONER_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "deepseek",
  modelId: DEEPSEEK_REASONER_MODEL_ID,
  displayName: "DeepSeek R1",
  contextSize: 64_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "DeepSeek's reasoning model (R1, 64k context).",
  shortDescription: "DeepSeek's reasoning model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  availableIfOneOf: {
    featureFlag: "deepseek_feature",
  },
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
