import type { ModelConfigurationType } from "@app/types";

// Pointing to mistral large 3 as of 2025-12-05
// https://docs.mistral.ai/models/mistral-large-3-25-12
export const MISTRAL_LARGE_MODEL_ID = "mistral-large-latest" as const;
// Pointing to mistral medium 3.1 as of 2025-12-05
// https://docs.mistral.ai/models/mistral-medium-3-1-25-08
export const MISTRAL_MEDIUM_MODEL_ID = "mistral-medium" as const;
// Pointing to mistral small 3.2 as of 2025-12-05
// https://docs.mistral.ai/models/mistral-small-3-2-25-06
export const MISTRAL_SMALL_MODEL_ID = "mistral-small-latest" as const;
export const MISTRAL_CODESTRAL_MODEL_ID = "codestral-latest" as const;
export const MISTRAL_LARGE_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "mistral",
  modelId: MISTRAL_LARGE_MODEL_ID,
  displayName: "Mistral Large",
  contextSize: 256_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 56, // 28_672
  largeModel: true,
  description: "Mistral's `large 3` model (256k context).",
  shortDescription: "Mistral's large model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 2048,
  supportsVision: true,
  supportsResponseFormat: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  tokenizer: { type: "sentence_piece", base: "model_v2" },
};
export const MISTRAL_MEDIUM_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "mistral",
  modelId: MISTRAL_MEDIUM_MODEL_ID,
  displayName: "Mistral Medium",
  contextSize: 128_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 56, // 28_672
  largeModel: true,
  description: "Mistral's `medium` model (128k context).",
  shortDescription: "Mistral's legacy model.",
  isLegacy: true,
  isLatest: true,
  generationTokensCount: 2048,
  supportsVision: true,
  supportsResponseFormat: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  tokenizer: { type: "sentence_piece", base: "model_v2" },
};
export const MISTRAL_SMALL_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "mistral",
  modelId: MISTRAL_SMALL_MODEL_ID,
  displayName: "Mistral Small",
  contextSize: 128_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 56, // 28_672
  largeModel: false,
  description: "Mistral's `small` model (128k context).",
  shortDescription: "Mistral's cost-effective model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: true,
  supportsResponseFormat: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  tokenizer: { type: "sentence_piece", base: "model_v2" },
};
export const MISTRAL_CODESTRAL_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "mistral",
  modelId: MISTRAL_CODESTRAL_MODEL_ID,
  displayName: "Mistral Codestral",
  contextSize: 128_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 56, // 28_672
  largeModel: false,
  description:
    "Mistral's `codestral` model, specifically designed and optimized for code generation tasks.",
  shortDescription: "Mistral's code model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  supportsResponseFormat: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  tokenizer: { type: "sentence_piece", base: "model_v2" },
};
