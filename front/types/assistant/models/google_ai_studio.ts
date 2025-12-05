import type { ModelConfigurationType } from "@app/types";

export const GEMINI_2_5_FLASH_MODEL_ID = "gemini-2.5-flash" as const;
export const GEMINI_2_5_FLASH_IMAGE_MODEL_ID =
  "gemini-2.5-flash-image" as const;
export const GEMINI_2_5_FLASH_LITE_MODEL_ID = "gemini-2.5-flash-lite" as const;
export const GEMINI_2_5_PRO_MODEL_ID = "gemini-2.5-pro" as const;
export const GEMINI_3_PRO_MODEL_ID = "gemini-3-pro-preview" as const;

export const GEMINI_2_5_FLASH_LITE_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_2_5_FLASH_LITE_MODEL_ID,
  displayName: "Gemini 2.5 Flash Lite",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: false,
  description: "Google's lightweight large context model (1m context).",
  shortDescription: "Google's lightweight model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: false, // response format not compatible with tool use
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
  useNativeLightReasoning: true,
  tokenizer: { type: "tiktoken", base: "cl100k_base" },
};
export const GEMINI_2_5_FLASH_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_2_5_FLASH_MODEL_ID,
  displayName: "Gemini 2.5 Flash",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "Google's fast large context model (1m context).",
  shortDescription: "Google's fast model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: false, // response format not compatible with tool use
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
  useNativeLightReasoning: true,
  tokenizer: { type: "tiktoken", base: "cl100k_base" },
};
export const GEMINI_2_5_PRO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_2_5_PRO_MODEL_ID,
  displayName: "Gemini 2.5 Pro",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "Google's powerful large context model (1m context).",
  shortDescription: "Google's powerful model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: false, // response format not compatible with tool use
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "light",
  useNativeLightReasoning: true,
  tokenizer: { type: "tiktoken", base: "cl100k_base" },
};
export const GEMINI_3_PRO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_3_PRO_MODEL_ID,
  displayName: "Gemini 3 Pro (Preview)",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "Google's most powerful large context model (1m context).",
  shortDescription: "Google's most powerful model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "light",
  tokenizer: { type: "tiktoken", base: "cl100k_base" },
  useNativeLightReasoning: true,
};
