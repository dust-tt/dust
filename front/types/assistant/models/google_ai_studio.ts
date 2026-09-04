import type { ModelConfigurationType } from "./types";

export const GEMINI_2_5_FLASH_MODEL_ID = "gemini-2.5-flash" as const;
export const GEMINI_2_5_FLASH_LITE_MODEL_ID = "gemini-2.5-flash-lite" as const;
export const GEMINI_3_PRO_IMAGE_MODEL_ID =
  "gemini-3-pro-image-preview" as const;
export const GEMINI_3_1_FLASH_IMAGE_MODEL_ID =
  "gemini-3.1-flash-image-preview" as const;
export const GEMINI_2_5_PRO_MODEL_ID = "gemini-2.5-pro" as const;
export const GEMINI_3_PRO_MODEL_ID = "gemini-3-pro-preview" as const;
export const GEMINI_3_1_PRO_MODEL_ID = "gemini-3.1-pro-preview" as const;
export const GEMINI_3_1_FLASH_LITE_MODEL_ID = "gemini-3.1-flash-lite" as const;
// Deprecated: gemini-3.1-flash-lite-preview was superseded by gemini-3.1-flash-lite.
export const GEMINI_3_1_FLASH_LITE_PREVIEW_DEPRECATED_MODEL_ID =
  "gemini-3.1-flash-lite-preview" as const;
export const GEMINI_3_5_FLASH_LITE_MODEL_ID = "gemini-3.5-flash-lite" as const;
export const GEMINI_3_FLASH_MODEL_ID = "gemini-3-flash-preview" as const;
export const GEMINI_3_5_FLASH_MODEL_ID = "gemini-3.5-flash" as const;
export const GEMINI_3_6_FLASH_MODEL_ID = "gemini-3.6-flash" as const;
export const GEMINI_3_7_FLASH_MODEL_ID = "gemini-3.7-flash" as const;
export const GEMINI_3_8_FLASH_MODEL_ID = "gemini-3.8-flash" as const;

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
  displayName: "Gemini 3.1 Flash Lite",
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

// Specs verified against https://ai.google.dev/gemini-api/docs/models
// (2026-07-25): mirrors the Flash-Lite family — multimodal (vision), 1M token
// context, up to 64k output tokens, exposes the `none` reasoning effort.
export const GEMINI_3_5_FLASH_LITE_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_3_5_FLASH_LITE_MODEL_ID,
  displayName: "Gemini 3.5 Flash Lite",
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

// Deprecated: superseded by gemini-3.1-flash-lite. Kept until existing agents are migrated.
export const GEMINI_3_1_FLASH_LITE_PREVIEW_DEPRECATED_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "google_ai_studio",
    modelId: GEMINI_3_1_FLASH_LITE_PREVIEW_DEPRECATED_MODEL_ID,
    displayName: "Gemini 3.1 Flash Lite (Preview)",
    contextSize: 1_000_000,
    recommendedTopK: 64,
    recommendedExhaustiveTopK: 64,
    largeModel: false,
    description:
      "Google's latest lightweight large context model (1m context).",
    shortDescription: "Google's latest lightweight model.",
    isLegacy: true,
    isLatest: false,
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
export const GEMINI_3_1_PRO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_3_1_PRO_MODEL_ID,
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

// Specs verified against https://ai.google.dev/gemini-api/docs/models
// (2026-07-25): Gemini 3.6 Flash is multimodal (vision) + agentic, with a 1M
// token context window and up to 64k output tokens.
export const GEMINI_3_6_FLASH_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_3_6_FLASH_MODEL_ID,
  displayName: "Gemini 3.6 Flash",
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
    // Day-one Vertex AI availability in us-central1; the EU (europe-west1)
    // agent-platform endpoint is not live yet (mirrors Gemini 3.5 Flash).
    "us-central1": true,
    "europe-west1": false,
  },
};

// Specs verified against
// https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash (2026-08-14):
// Gemini 3.7 Flash is multimodal (text/image/audio/video/PDF) with structured
// outputs, a 1,048,576-token context window and up to 65,536 output tokens.
// Thinking levels are low/medium/high — `minimal` returns a validation error
// and thinking cannot be disabled, so there is no thinking-off effort.
export const GEMINI_3_7_FLASH_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_3_7_FLASH_MODEL_ID,
  displayName: "Gemini 3.7 Flash",
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
    // Day-one Vertex AI availability in us-central1; the EU (europe-west1)
    // agent-platform endpoint is not live yet (mirrors Gemini 3.6 Flash).
    "us-central1": true,
    "europe-west1": false,
  },
};

// Specs verified against
// https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash (2026-09-04):
// Gemini 3.8 Flash accepts text, images, audio, video, and PDFs, supports
// structured output and batch processing, has a 1,048,576-token context window,
// and generates up to 65,536 tokens. The documented thinking levels are low,
// medium, and high; minimal is rejected and thinking-off is undocumented.
export const GEMINI_3_8_FLASH_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_3_8_FLASH_MODEL_ID,
  displayName: "Gemini 3.8 Flash",
  contextSize: 1_048_576,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Google's latest intelligent model for coding and agentic workflows (1m context).",
  shortDescription: "Google's latest intelligent Flash model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 65_536,
  supportsVision: true,
  supportsResponseFormat: true,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  tokenizer: { type: "tiktoken", base: "cl100k_base" },
  useNativeLightReasoning: true,
  supportsBatchProcessing: true,
  regionalAvailability: {
    // The native Agent Platform API serves the model globally, but `eu` failed
    // with "Invalid hostname: eu-aiplatform.googleapis.com" in a live test on
    // 2026-09-04. Keep EU disabled until the native API supports it.
    "us-central1": true,
    "europe-west1": false,
  },
};
