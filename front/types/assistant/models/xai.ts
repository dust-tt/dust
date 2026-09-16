import type { ModelConfigurationType } from "./types";

export const GROK_4_5_MODEL_ID = "grok-4.5" as const;
export const GROK_4_6_MODEL_ID = "grok-4.6" as const;

// Deprecated. As of 19/05/26, legacy Grok model IDs point to grok-4.3,
// including older IDs such as grok-3-mini-high.
export const GROK_4_MODEL_ID = "grok-4-latest" as const;

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
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
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
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};

// Verified 2026-08-12: https://docs.x.ai/developers/models/grok-4.5
export const GROK_4_5_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "xai",
  modelId: GROK_4_5_MODEL_ID,
  displayName: "Grok 4.5",
  contextSize: 500_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "xAI's Grok 4.5 flagship model (500k context, reasoning, vision).",
  shortDescription: "xAI's previous flagship model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 8_192,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "high",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};

// Specs verified 2026-08-12 against
// https://docs.x.ai/developers/models/grok-4.6 (500k native context, text and
// image input, function calling, structured output, reasoning). Dust caps the
// usable context at 256k and output at 64k, leaving a 192k prompt budget below
// xAI's 200k long-context pricing threshold.
export const GROK_4_6_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "xai",
  modelId: GROK_4_6_MODEL_ID,
  displayName: "Grok 4.6",
  contextSize: 256_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "xAI's Grok 4.6 flagship model for coding and long-running agentic work (256k context, reasoning, vision).",
  shortDescription: "xAI's latest flagship model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "high",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  // xAI lists only US clusters (us-east-1 and us-west-2) at launch:
  // https://docs.x.ai/developers/models/grok-4.6 (2026-08-12).
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
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
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 8_192,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "light",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
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
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
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
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
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
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
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
    supportedReasoningEfforts: {
      none: true,
      light: false,
      medium: false,
      high: false,
    },
    defaultReasoningEffort: "none",
    supportsResponseFormat: false,
    tokenizer: { type: "tiktoken", base: "o200k_base" },
    regionalAvailability: {
      "us-central1": true,
      "europe-west1": false,
    },
  };
