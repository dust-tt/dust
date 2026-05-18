import type { ModelConfigurationType } from "./types";

// As of 19/05/26, all grok model ID points to grok-4.3
// Even oldest ones like grok-3-mini-high
export const GROK_4_MODEL_ID = "grok-4-latest" as const;

// Deprecated
export const GROK_3_MODEL_ID = "grok-3-latest" as const;
export const GROK_3_MINI_MODEL_ID = "grok-3-mini-latest" as const;
export const GROK_4_FAST_REASONING_MODEL_ID =
  "grok-4-fast-reasoning-latest" as const;
export const GROK_4_1_FAST_REASONING_MODEL_ID =
  "grok-4-1-fast-reasoning-latest" as const;
export const GROK_4_FAST_NON_REASONING_MODEL_ID =
  "grok-4-fast-non-reasoning-latest" as const;
export const GROK_4_1_FAST_NON_REASONING_MODEL_ID =
  "grok-4-1-fast-non-reasoning-latest" as const;

export const GROK_3_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "xai",
  modelId: GROK_3_MODEL_ID,
  displayName: "Grok 3",
  contextSize: 131_072,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "xAI's Grok 3 flagship model (131k context).",
  shortDescription: "xAI's flagship model.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 8_192,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  availableIfOneOf: {
    featureFlag: "xai_feature",
  },
  tokenizer: { type: "tiktoken", base: "o200k_base" },
};
export const GROK_3_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "xai",
  modelId: GROK_3_MINI_MODEL_ID,
  displayName: "Grok 3 Mini",
  contextSize: 131_072,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: false,
  description: "xAI's Grok 3 Mini model (131k context, reasoning).",
  shortDescription: "xAI's reasoning model.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 8_192,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  availableIfOneOf: {
    featureFlag: "xai_feature",
  },
  tokenizer: { type: "tiktoken", base: "o200k_base" },
};

export const GROK_4_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "xai",
  modelId: GROK_4_MODEL_ID,
  displayName: "Grok 4",
  contextSize: 1_000_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "xAI's Grok 4 flagship model (1M context, reasoning, vision).",
  shortDescription: "xAI's flagship model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 8_192,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "light",
  supportsResponseFormat: false,
  availableIfOneOf: {
    featureFlag: "xai_feature",
  },
  tokenizer: { type: "tiktoken", base: "o200k_base" },
};

export const GROK_4_FAST_REASONING_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "xai",
  modelId: GROK_4_FAST_REASONING_MODEL_ID,
  displayName: "Grok 4 Fast",
  contextSize: 2_000_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "xAI's Grok 4 fast flagship model (2M context).",
  shortDescription: "xAI's fast flagship model.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 8_192,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  availableIfOneOf: {
    featureFlag: "xai_feature",
  },
  tokenizer: { type: "tiktoken", base: "o200k_base" },
};
export const GROK_4_FAST_NON_REASONING_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "xai",
  modelId: GROK_4_FAST_NON_REASONING_MODEL_ID,
  displayName: "Grok 4 Fast (Non-Reasoning)",
  contextSize: 2_000_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "xAI's Grok 4 fast non-reasoning flagship model (2M context).",
  shortDescription: "xAI's flagship non-reasoning model.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 8_192,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  availableIfOneOf: {
    featureFlag: "xai_feature",
  },
  tokenizer: { type: "tiktoken", base: "o200k_base" },
};
export const GROK_4_1_FAST_REASONING_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "xai",
  modelId: GROK_4_1_FAST_REASONING_MODEL_ID,
  displayName: "Grok 4.1 Fast",
  contextSize: 2_000_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "xAI's Grok 4.1 fast flagship model (2M context).",
  shortDescription: "xAI's fast flagship model.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 8_192,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  availableIfOneOf: {
    featureFlag: "xai_feature",
  },
  tokenizer: { type: "tiktoken", base: "o200k_base" },
};
export const GROK_4_1_FAST_NON_REASONING_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "xai",
    modelId: GROK_4_1_FAST_NON_REASONING_MODEL_ID,
    displayName: "Grok 4.1 Fast (Non-Reasoning)",
    contextSize: 2_000_000,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64,
    largeModel: true,
    description:
      "xAI's Grok 4.1 fast non-reasoning flagship model (2M context).",
    shortDescription: "xAI's flagship non-reasoning model.",
    isLegacy: true,
    isLatest: false,
    generationTokensCount: 8_192,
    supportsVision: true,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
    supportsResponseFormat: false,
    availableIfOneOf: {
      featureFlag: "xai_feature",
    },
    tokenizer: { type: "tiktoken", base: "o200k_base" },
  };
