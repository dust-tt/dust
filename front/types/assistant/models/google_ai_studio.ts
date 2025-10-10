import type { ModelConfigurationType } from "@app/types";

export const GEMINI_1_5_PRO_LATEST_MODEL_ID = "gemini-1.5-pro-latest" as const;
export const GEMINI_1_5_FLASH_LATEST_MODEL_ID =
  "gemini-1.5-flash-latest" as const;
export const GEMINI_2_FLASH_MODEL_ID = "gemini-2.0-flash" as const;
export const GEMINI_2_FLASH_LITE_MODEL_ID = "gemini-2.0-flash-lite" as const;
export const GEMINI_2_5_PRO_PREVIEW_MODEL_ID = "gemini-2.5-pro-preview-03-25";
export const GEMINI_2_5_FLASH_MODEL_ID = "gemini-2.5-flash" as const;
export const GEMINI_2_5_FLASH_LITE_MODEL_ID = "gemini-2.5-flash-lite" as const;
export const GEMINI_2_5_PRO_MODEL_ID = "gemini-2.5-pro" as const;
// These Gemini preview models are deprecated (either replaced by a GA model or not making it to GA)
export const GEMINI_2_FLASH_PREVIEW_MODEL_ID = "gemini-2.0-flash-exp" as const;
export const GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_ID =
  "gemini-2.0-flash-thinking-exp-01-21" as const;
export const GEMINI_2_FLASH_LITE_PREVIEW_MODEL_ID =
  "gemini-2.0-flash-lite-preview-02-05" as const;
export const GEMINI_2_PRO_PREVIEW_MODEL_ID =
  "gemini-2.0-pro-exp-02-05" as const;
// DEPRECATED -- Replaced by 2.5 family
export const GEMINI_PRO_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_1_5_PRO_LATEST_MODEL_ID,
  displayName: "Gemini Pro 1.5",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description:
    "Google's best model for scaling across a wide range of tasks (1m context).",
  shortDescription: "Google's large model.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
};
// DEPRECATED -- Replaced by 2.5 family
export const GEMINI_FLASH_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_1_5_FLASH_LATEST_MODEL_ID,
  displayName: "Gemini Flash 1.5",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description:
    "Google's lightweight, fast and cost-efficient model (1m context).",
  shortDescription: "Google's cost-effective model.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
};
// DEPRECATED -- Replaced by 2.5 family
export const GEMINI_2_FLASH_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_2_FLASH_MODEL_ID,
  displayName: "Gemini Flash 2.0",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "Google's fast large context model (1m context).",
  shortDescription: "Google's fast model.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
};
// DEPRECATED -- Replaced by 2.5 family
export const GEMINI_2_FLASH_LITE_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_2_FLASH_LITE_MODEL_ID,
  displayName: "Gemini Flash 2.0 Lite",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: false,
  description: "Google's lightweight large context model (1m context).",
  shortDescription: "Google's lightweight model.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
};
// DEPRECATED -- Replaced by Gemini 2.5 Pro
export const GEMINI_2_5_PRO_PREVIEW_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_2_5_PRO_PREVIEW_MODEL_ID,
  displayName: "Gemini 2.5 Pro Preview",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "Google's powerful large context model (1m context).",
  shortDescription: "Google's powerful model (preview).",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
};
// DEPRECATED -- Replaced by GA model
export const GEMINI_2_FLASH_LITE_PREVIEW_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "google_ai_studio",
    modelId: GEMINI_2_FLASH_LITE_PREVIEW_MODEL_ID,
    displayName: "Gemini Flash 2.0 Lite Preview",
    contextSize: 1_000_000,
    recommendedTopK: 64,
    recommendedExhaustiveTopK: 64,
    largeModel: true,
    description: "Google's lightweight large context model (1m context).",
    shortDescription: "Google's lightweight model (preview).",
    isLegacy: true,
    isLatest: false,
    generationTokensCount: 2048,
    supportsVision: true,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
    featureFlag: "google_ai_studio_experimental_models_feature",
  };
// DEPRECATED -- Replaced by GA model
export const GEMINI_2_FLASH_PREVIEW_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_2_FLASH_PREVIEW_MODEL_ID,
  displayName: "Gemini Flash 2.0",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Google's lightweight, fast and cost-efficient model (1m context).",
  shortDescription: "Google's cost-effective model (preview).",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  featureFlag: "google_ai_studio_experimental_models_feature",
};
// DEPRECATED -- Not making it to GA
export const GEMINI_2_PRO_PREVIEW_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_2_PRO_PREVIEW_MODEL_ID,
  displayName: "Gemini Flash 2.0 Pro Preview",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "Google's powerful large context model (1m context).",
  shortDescription: "Google's powerful model (preview).",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  featureFlag: "google_ai_studio_experimental_models_feature",
};
// DEPRECATED -- Not making it to GA
export const GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "google_ai_studio",
    modelId: GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_ID,
    displayName: "Gemini Flash 2.0 Thinking",
    contextSize: 32_000,
    recommendedTopK: 64,
    recommendedExhaustiveTopK: 64,
    largeModel: true,
    description:
      "Google's lightweight model optimized for reasoning (1m context).",
    shortDescription: "Google's reasoning-focused model (preview).",
    isLegacy: false,
    isLatest: false,
    generationTokensCount: 2048,
    supportsVision: true,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
    featureFlag: "google_ai_studio_experimental_models_feature",
  };
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
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
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
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
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
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
};
