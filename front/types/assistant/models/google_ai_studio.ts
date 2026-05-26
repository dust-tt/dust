import type { ModelConfigurationType } from "./types";

export const GEMINI_2_5_FLASH_MODEL_ID = "gemini-2.5-flash" as const;
export const GEMINI_2_5_FLASH_LITE_MODEL_ID = "gemini-2.5-flash-lite" as const;
export const GEMINI_3_PRO_IMAGE_MODEL_ID =
  "gemini-3-pro-image-preview" as const;
export const GEMINI_3_1_FLASH_IMAGE_MODEL_ID =
  "gemini-3.1-flash-image-preview" as const;
export const GEMINI_2_5_PRO_MODEL_ID = "gemini-2.5-pro" as const;
export const GEMINI_3_PRO_MODEL_ID = "gemini-3-pro-preview" as const;
export const GEMINI_3_1_PRO_PREVIEW_MODEL_ID =
  "gemini-3.1-pro-preview" as const;
export const GEMINI_3_1_FLASH_LITE_MODEL_ID =
  "gemini-3.1-flash-lite-preview" as const;
export const GEMINI_3_FLASH_MODEL_ID = "gemini-3-flash-preview" as const;
export const GEMINI_3_5_FLASH_MODEL_ID = "gemini-3.5-flash" as const;

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
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: false, // response format not compatible with tool use
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "light",
  useNativeLightReasoning: true,
  tokenizer: { type: "tiktoken", base: "cl100k_base" },
  supportsBatchProcessing: true,
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
export const GEMINI_3_1_FLASH_LITE_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_3_1_FLASH_LITE_MODEL_ID,
  displayName: "Gemini 3.1 Flash Lite (Preview)",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: false,
  description: "Google's latest lightweight large context model (1m context).",
  shortDescription: "Google's latest lightweight model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: true,
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "light",
  useNativeLightReasoning: true,
  tokenizer: { type: "tiktoken", base: "cl100k_base" },
  supportsBatchProcessing: true,
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
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
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "light",
  useNativeLightReasoning: true,
  tokenizer: { type: "tiktoken", base: "cl100k_base" },
  supportsBatchProcessing: true,
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
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
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "light",
  useNativeLightReasoning: true,
  tokenizer: { type: "tiktoken", base: "cl100k_base" },
  supportsBatchProcessing: true,
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
export const GEMINI_3_PRO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_3_PRO_MODEL_ID,
  displayName: "Gemini 3 Pro",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Google's previous powerful model with enhanced reasoning (1m context).",
  shortDescription: "Google's most powerful model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: true,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "light",
  tokenizer: { type: "tiktoken", base: "cl100k_base" },
  useNativeLightReasoning: true,
  supportsBatchProcessing: true,
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
export const GEMINI_3_1_PRO_PREVIEW_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_3_1_PRO_PREVIEW_MODEL_ID,
  displayName: "Gemini 3.1 Pro (Preview)",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Google's latest powerful model with enhanced reasoning (1m context).",
  shortDescription: "Google's most advanced model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: true,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "light",
  tokenizer: { type: "tiktoken", base: "cl100k_base" },
  useNativeLightReasoning: true,
  supportsBatchProcessing: true,
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
export const GEMINI_3_FLASH_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_3_FLASH_MODEL_ID,
  displayName: "Gemini 3 Flash (Preview)",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "Google's fast large context model (1m context).",
  shortDescription: "Google's fast model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: true,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "light",
  tokenizer: { type: "tiktoken", base: "cl100k_base" },
  useNativeLightReasoning: true,
  supportsBatchProcessing: true,
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};

export const GEMINI_3_5_FLASH_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_3_5_FLASH_MODEL_ID,
  displayName: "Gemini 3.5 Flash",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "Google's latest fast large context model (1m context).",
  shortDescription: "Google's fast model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: true,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "light",
  tokenizer: { type: "tiktoken", base: "cl100k_base" },
  useNativeLightReasoning: true,
  supportsBatchProcessing: true,
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
