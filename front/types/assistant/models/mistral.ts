import type { ModelConfigurationType } from "@app/types";

export const MISTRAL_LARGE_MODEL_ID = "mistral-large-latest" as const;
export const MISTRAL_MEDIUM_MODEL_ID = "mistral-medium" as const;
export const MISTRAL_SMALL_MODEL_ID = "mistral-small-latest" as const;
export const MISTRAL_CODESTRAL_MODEL_ID = "codestral-latest" as const;
export const MISTRAL_LARGE_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "mistral",
  modelId: MISTRAL_LARGE_MODEL_ID,
  displayName: "Mistral Large",
  contextSize: 128_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 56, // 28_672
  largeModel: true,
  description: "Mistral's `large 2` model (128k context).",
  shortDescription: "Mistral's large model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
};
export const MISTRAL_MEDIUM_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "mistral",
  modelId: MISTRAL_MEDIUM_MODEL_ID,
  displayName: "Mistral Medium",
  contextSize: 32_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 56, // 28_672
  largeModel: true,
  description: "Mistral's `medium` model (32k context).",
  shortDescription: "Mistral's legacy model.",
  isLegacy: true,
  isLatest: true,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
};
export const MISTRAL_SMALL_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "mistral",
  modelId: MISTRAL_SMALL_MODEL_ID,
  displayName: "Mistral Small",
  contextSize: 32_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 56, // 28_672
  largeModel: false,
  description: "Mistral's `small` model (8x7B Instruct, 32k context).",
  shortDescription: "Mistral's cost-effective model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
};
export const MISTRAL_CODESTRAL_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "mistral",
  modelId: MISTRAL_CODESTRAL_MODEL_ID,
  displayName: "Mistral Codestral",
  contextSize: 32_000,
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
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
};
