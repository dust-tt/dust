import type { ModelConfigurationType } from "@app/types";

export const FIREWORKS_DEEPSEEK_R1_MODEL_ID =
  "accounts/fireworks/models/deepseek-r1-0528" as const;
export const FIREWORKS_DEEPSEEK_V3P2_MODEL_ID =
  "accounts/fireworks/models/deepseek-v3p2" as const;
export const FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID =
  "accounts/fireworks/models/kimi-k2-instruct" as const;
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
