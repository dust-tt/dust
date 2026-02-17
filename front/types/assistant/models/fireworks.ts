import type { ModelConfigurationType } from "./types";

export const FIREWORKS_DEEPSEEK_R1_MODEL_ID =
  "accounts/fireworks/models/deepseek-r1-0528" as const;
export const FIREWORKS_DEEPSEEK_V3P2_MODEL_ID =
  "accounts/fireworks/models/deepseek-v3p2" as const;
export const FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID =
  "accounts/fireworks/models/kimi-k2-instruct-0905" as const;
export const FIREWORKS_KIMI_K2P5_MODEL_ID =
  "accounts/fireworks/models/kimi-k2p5" as const;
export const FIREWORKS_MINIMAX_M2P5_MODEL_ID =
  "accounts/fireworks/models/minimax-m2p5" as const;
export const FIREWORKS_GLM_5_MODEL_ID =
  "accounts/fireworks/models/glm-5" as const;
export const FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelId: FIREWORKS_DEEPSEEK_R1_MODEL_ID,
  displayName: "DeepSeek R1 (Fireworks)",
  contextSize: 164_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "DeepSeek's reasoning model (164k context, served via Fireworks).",
  shortDescription: "DeepSeek R1 (reasoning model).",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  tokenizer: { type: "tiktoken", base: "o200k_base" },
};
export const FIREWORKS_DEEPSEEK_V3P2_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelId: FIREWORKS_DEEPSEEK_V3P2_MODEL_ID,
  displayName: "DeepSeek V3.2 (Fireworks)",
  contextSize: 163_800,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "DeepSeek's V3.2 model with high computational efficiency and superior reasoning (163.8k context, served via Fireworks).",
  shortDescription: "DeepSeek's V3.2 model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 2048,
  supportsVision: false,
  // TODO(2025-12-03 pierre) Deepseek V3.2 reasoning support requires a bit more work
  // https://api-docs.deepseek.com/guides/thinking_mode
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
  featureFlag: "fireworks_new_model_feature",
  tokenizer: { type: "tiktoken", base: "o200k_base" },
};
export const FIREWORKS_KIMI_K2_INSTRUCT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
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
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
  tokenizer: { type: "tiktoken", base: "o200k_base" },
};
export const FIREWORKS_KIMI_K2P5_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
  modelId: FIREWORKS_KIMI_K2P5_MODEL_ID,
  displayName: "Kimi K2.5 (Fireworks)",
  contextSize: 262_100,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Moonshot AI's flagship agentic model with 262k context and vision support (served via Fireworks).",
  shortDescription: "Kimi K2.5 with vision support.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 2048,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "light",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  featureFlag: "fireworks_new_model_feature",
};
export const FIREWORKS_MINIMAX_M2P5_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
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
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  featureFlag: "fireworks_new_model_feature",
};
export const FIREWORKS_GLM_5_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "fireworks",
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
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  featureFlag: "fireworks_new_model_feature",
};
