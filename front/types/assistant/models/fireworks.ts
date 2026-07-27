import type { ModelConfigurationType } from "./types";

export const FIREWORKS_DEEPSEEK_V3P2_MODEL_ID =
  "accounts/fireworks/models/deepseek-v3p2" as const;
export const FIREWORKS_DEEPSEEK_V4_PRO_MODEL_ID =
  "accounts/fireworks/models/deepseek-v4-pro" as const;
export const FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID =
  "accounts/fireworks/models/kimi-k2-instruct-0905" as const;
export const FIREWORKS_KIMI_K2P5_MODEL_ID =
  "accounts/fireworks/models/kimi-k2p5" as const;
export const FIREWORKS_KIMI_K2P6_MODEL_ID =
  "accounts/fireworks/models/kimi-k2p6" as const;
export const FIREWORKS_KIMI_K3_MODEL_ID =
  "accounts/fireworks/models/kimi-k3" as const;
export const FIREWORKS_MINIMAX_M2P5_MODEL_ID =
  "accounts/fireworks/models/minimax-m2p5" as const;
export const FIREWORKS_GLM_5_MODEL_ID =
  "accounts/fireworks/models/glm-5" as const;
export const FIREWORKS_GLM_5P2_MODEL_ID =
  "accounts/fireworks/models/glm-5p2" as const;
export const FIREWORKS_DEEPSEEK_V3P2_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "deepseek",
  modelId: FIREWORKS_DEEPSEEK_V3P2_MODEL_ID,
  displayName: "DeepSeek V3.2 (Fireworks)",
  contextSize: 163_800,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "DeepSeek's V3.2 model with high computational efficiency and superior reasoning (163.8k context, served via Fireworks).",
  shortDescription: "DeepSeek's V3.2 model.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  // TODO(2025-12-03 pierre) Deepseek V3.2 reasoning support requires a bit more work
  // https://api-docs.deepseek.com/guides/thinking_mode
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
  availableIfOneOf: {
    featureFlag: "fireworks_new_model_feature",
  },
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
export const FIREWORKS_DEEPSEEK_V4_PRO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "deepseek",
  modelId: FIREWORKS_DEEPSEEK_V4_PRO_MODEL_ID,
  displayName: "DeepSeek V4 Pro (Fireworks)",
  contextSize: 1_000_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "DeepSeek's V4 Pro Mixture-of-Experts model with frontier reasoning, advanced coding, and 1M context (served via Fireworks).",
  shortDescription: "DeepSeek's V4 Pro model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
export const FIREWORKS_KIMI_K2_INSTRUCT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "moonshot",
  modelId: FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID,
  displayName: "Kimi K2 Instruct (Fireworks)",
  contextSize: 131_072,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "Kimi's K2 Instruct model (131k context, served via Fireworks).",
  shortDescription: "Kimi's K2 Instruct model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "light",
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
export const FIREWORKS_KIMI_K2P5_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "moonshot",
  modelId: FIREWORKS_KIMI_K2P5_MODEL_ID,
  displayName: "Kimi K2.5 (Fireworks)",
  contextSize: 262_100,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Moonshot AI's agentic model with 262k context and vision support (served via Fireworks).",
  shortDescription: "Kimi K2.5 with vision support.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 2048,
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
  availableIfOneOf: {
    featureFlag: "fireworks_new_model_feature",
  },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
// https://fireworks.ai/models/fireworks/kimi-k2p6
export const FIREWORKS_KIMI_K2P6_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "moonshot",
  modelId: FIREWORKS_KIMI_K2P6_MODEL_ID,
  displayName: "Kimi K2.6 (Fireworks)",
  contextSize: 262_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Moonshot AI's K2.6 agentic model with 262k context and vision support (served via Fireworks).",
  shortDescription: "Kimi K2.6 with vision support.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
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
  availableIfOneOf: {
    featureFlag: "fireworks_new_model_feature",
  },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
// Specs and pricing verified 2026-07-27 against
// https://fireworks.ai/models/fireworks/kimi-k3 (1040k context, function
// calling, image input) and https://platform.kimi.ai/docs/guide/kimi-k3-quickstart
// (JSON-schema structured output, thinking always enabled).
// US-only, like every other Fireworks-served model.
// Dust caps usable context at 256k of the model's 1040k, leaving a 192k prompt
// budget once the 64k generation reserve is taken out.
export const FIREWORKS_KIMI_K3_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "moonshot",
  modelId: FIREWORKS_KIMI_K3_MODEL_ID,
  displayName: "Kimi K3 (Fireworks)",
  contextSize: 256_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Moonshot AI's flagship 2.8T Mixture-of-Experts model for complex coding and long-horizon agentic work, with 256k context and vision support (served via Fireworks).",
  shortDescription: "Kimi K3 with 256k context and vision support.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
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
export const FIREWORKS_MINIMAX_M2P5_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "minimax",
  modelId: FIREWORKS_MINIMAX_M2P5_MODEL_ID,
  displayName: "MiniMax M2.5 (Fireworks)",
  contextSize: 196_608,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "MiniMax's MoE model optimized for coding and agentic tool use (196k context, served via Fireworks).",
  shortDescription: "MiniMax M2.5 for coding and agentic tasks.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 2048,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "light",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  availableIfOneOf: {
    featureFlag: "fireworks_new_model_feature",
  },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
// https://fireworks.ai/models/fireworks/glm-5p2
export const FIREWORKS_GLM_5P2_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "zai",
  modelId: FIREWORKS_GLM_5P2_MODEL_ID,
  displayName: "GLM-5.2 (Fireworks)",
  contextSize: 1_000_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Z.ai's GLM-5.2 Mixture-of-Experts model with advanced coding and long-horizon agentic capabilities (1M context, served via Fireworks).",
  shortDescription: "GLM-5.2 for coding and agentic tasks.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: false,
    light: false,
    medium: false,
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
export const FIREWORKS_GLM_5_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelMaker: "zai",
  modelId: FIREWORKS_GLM_5_MODEL_ID,
  displayName: "GLM-5 (Fireworks)",
  contextSize: 202_752,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Zhipu AI's MoE model for complex systems engineering and long-horizon agentic tasks (202k context, served via Fireworks).",
  shortDescription: "GLM-5 for systems engineering and agentic tasks.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 2048,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "light",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  availableIfOneOf: {
    featureFlag: "fireworks_new_model_feature",
  },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
