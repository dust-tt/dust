import type { ModelConfigurationType } from "./types";

export const CLAUDE_4_OPUS_20250514_MODEL_ID =
  "claude-4-opus-20250514" as const;
export const CLAUDE_4_SONNET_20250514_MODEL_ID =
  "claude-4-sonnet-20250514" as const;
export const CLAUDE_4_5_SONNET_20250929_MODEL_ID =
  "claude-sonnet-4-5-20250929" as const;
export const CLAUDE_3_OPUS_2024029_MODEL_ID = "claude-3-opus-20240229" as const;
export const CLAUDE_3_5_SONNET_20240620_MODEL_ID =
  "claude-3-5-sonnet-20240620" as const;
export const CLAUDE_3_5_SONNET_20241022_MODEL_ID =
  "claude-3-5-sonnet-20241022" as const;
export const CLAUDE_3_7_SONNET_20250219_MODEL_ID =
  "claude-3-7-sonnet-20250219" as const;
export const CLAUDE_3_HAIKU_20240307_MODEL_ID =
  "claude-3-haiku-20240307" as const;
export const CLAUDE_3_5_HAIKU_20241022_MODEL_ID =
  "claude-3-5-haiku-20241022" as const;
export const CLAUDE_4_5_HAIKU_20251001_MODEL_ID =
  "claude-haiku-4-5-20251001" as const;
export const CLAUDE_4_5_OPUS_20251101_MODEL_ID =
  "claude-opus-4-5-20251101" as const;
export const CLAUDE_OPUS_4_6_MODEL_ID = "claude-opus-4-6" as const;
export const CLAUDE_OPUS_4_7_MODEL_ID = "claude-opus-4-7" as const;
export const CLAUDE_SONNET_4_6_MODEL_ID = "claude-sonnet-4-6" as const;

export const ANTHROPIC_TOKEN_COUNT_ADJUSTMENT = 1.3;
export const CLAUDE_4_OPUS_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_4_OPUS_20250514_MODEL_ID,
  displayName: "Claude 4 Opus",
  contextSize: 200_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Anthropic's Claude 4 Opus model, a powerful model in the Claude 4 family (200k context).",
  shortDescription: "A powerful Claude 4 model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 32_000,
  supportsVision: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "light",
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
  supportsBatchProcessing: true,
  availableIfOneOf: {
    featureFlag: "claude_4_opus_feature",
  },
  tokenizer: { type: "tiktoken", base: "anthropic_base" },
};
export const CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
  displayName: "Claude 4 Sonnet",
  contextSize: 200_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Anthropic's Claude 4 Sonnet model, balancing power and efficiency (200k context).",
  shortDescription: "Anthropic's balanced Claude 4 model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "light",
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
  supportsBatchProcessing: true,
  tokenizer: { type: "tiktoken", base: "anthropic_base" },
};
export const CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_4_5_SONNET_20250929_MODEL_ID,
  displayName: "Claude 4.5 Sonnet",
  contextSize: 200_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Anthropic's Claude 4.5 Sonnet model with enhanced reasoning and tool use (200k context).",
  shortDescription: "Anthropic's previous balanced model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "light",
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
  supportsPromptCaching: true,
  supportsBatchProcessing: true,
  tokenizer: { type: "tiktoken", base: "anthropic_base" },
};
export const CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
  displayName: "Claude 3.5 Haiku",
  contextSize: 180_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: false,
  description:
    "Anthropic's Claude 3.5 Haiku model, cost effective and high throughput (200k context).",
  shortDescription: "Anthropic's cost-effective model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
  supportsBatchProcessing: true,
  tokenizer: { type: "tiktoken", base: "anthropic_base" },
};
export const CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_3_HAIKU_20240307_MODEL_ID,
  displayName: "Claude 3 Haiku",
  contextSize: 180_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: false,
  description:
    "Anthropic's Claude 3 Haiku model, cost effective and high throughput (200k context).",
  shortDescription: "Anthropic's cost-effective model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
  tokenizer: { type: "tiktoken", base: "anthropic_base" },
};
export const CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  displayName: "Claude 4.5 Haiku",
  contextSize: 180_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: false,
  description:
    "Anthropic's Claude 4.5 Haiku model, cost effective and high throughput (200k context).",
  shortDescription: "Anthropic's latest super-fast model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "light",
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
  supportsBatchProcessing: true,
  tokenizer: { type: "tiktoken", base: "anthropic_base" },
};
export const CLAUDE_4_5_OPUS_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_4_5_OPUS_20251101_MODEL_ID,
  displayName: "Claude 4.5 Opus",
  contextSize: 200_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Anthropic's Claude 4.5 Opus model, an advanced model with strong coding and reasoning capabilities (200k context).",
  shortDescription: "Anthropic's most advanced model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "light",
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
  supportsPromptCaching: true,
  supportsBatchProcessing: true,
  availableIfOneOf: {
    featureFlag: "claude_4_5_opus_feature",
  },
  tokenizer: { type: "tiktoken", base: "anthropic_base" },
};
export const CLAUDE_OPUS_4_6_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_OPUS_4_6_MODEL_ID,
  displayName: "Claude Opus 4.6",
  contextSize: 200_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Anthropic's Claude Opus 4.6 model, an advanced model with enhanced reasoning capabilities (200k context).",
  shortDescription: "Anthropic's previous flagship model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "medium",
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
  supportsPromptCaching: true,
  supportsBatchProcessing: true,
  tokenizer: { type: "tiktoken", base: "anthropic_base" },
  customThinkingType: "auto",
  availableIfOneOf: {
    enterprise: true,
    featureFlag: "claude_4_5_opus_feature",
  },
  customBetas: [
    "auto-thinking-2026-01-12",
    "effort-2025-11-24",
    "max-effort-2026-01-24",
  ],
  disablePrefill: true,
};
export const CLAUDE_OPUS_4_7_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_OPUS_4_7_MODEL_ID,
  displayName: "Claude Opus 4.7",
  contextSize: 200_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Anthropic's Claude Opus 4.7 model, the latest and most capable model with a step-change improvement in agentic coding (200k context).",
  shortDescription: "Anthropic's latest flagship model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "medium",
  // Opus 4.7 uses a new tokenizer (~555k words/1M tokens vs ~750k for anthropic_base).
  // Ratio: 750/555 ≈ 1.35, applied on top of the base 1.3 adjustment → 1.3 × 1.35 ≈ 1.75.
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT * 1.35,
  supportsPromptCaching: true,
  supportsBatchProcessing: true,
  tokenizer: { type: "tiktoken", base: "anthropic_base" },
  customThinkingType: "auto",
  availableIfOneOf: {
    enterprise: true,
    featureFlag: "claude_4_5_opus_feature",
  },
  customBetas: [
    "auto-thinking-2026-01-12",
    "effort-2025-11-24",
    "max-effort-2026-01-24",
  ],
  disablePrefill: true,
};
export const CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_SONNET_4_6_MODEL_ID,
  displayName: "Claude Sonnet 4.6",
  // 200k, reducing it temporarily to avoid "prompt too long" errors on dust agent
  // due to reasoning tokens not being counted when estimating prompt size in countTokensForMessages
  // Keeping 190k while Anthropic token count API rate limit hasn't been increased
  contextSize: 190_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Anthropic's Claude Sonnet 4.6 model, balancing power and efficiency with enhanced reasoning capabilities (200k context).",
  shortDescription: "Anthropic's latest balanced model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "medium",
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
  supportsPromptCaching: true,
  supportsBatchProcessing: true,
  tokenizer: { type: "tiktoken", base: "anthropic_base" },
  customThinkingType: "auto",
  customBetas: [
    "auto-thinking-2026-01-12",
    "effort-2025-11-24",
    "max-effort-2026-01-24",
  ],
  disablePrefill: true,
};

/**
 * Deprecated
 */

export const CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_3_OPUS_2024029_MODEL_ID,
  displayName: "Claude 3 Opus",
  contextSize: 180_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "Anthropic's Claude 3 Opus model (200k context).",
  shortDescription: "Anthropic's largest model.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 4096,
  supportsVision: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
  tokenizer: { type: "tiktoken", base: "anthropic_base" },
};
export const CLAUDE_3_5_SONNET_20240620_DEPRECATED_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "anthropic",
    modelId: CLAUDE_3_5_SONNET_20240620_MODEL_ID,
    displayName: "Claude 3.5 Sonnet",
    contextSize: 180_000,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64, // 32_768
    largeModel: true,
    description: "Anthropic's latest Claude 3.5 Sonnet model (200k context).",
    shortDescription: "Anthropic's latest model.",
    isLegacy: true,
    isLatest: false,
    generationTokensCount: 8192,
    supportsVision: true,
    minimumReasoningEffort: "light",
    maximumReasoningEffort: "light",
    defaultReasoningEffort: "light",
    tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
    tokenizer: { type: "tiktoken", base: "anthropic_base" },
  };
export const CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_3_5_SONNET_20241022_MODEL_ID,
  displayName: "Claude 3.5 Sonnet",
  contextSize: 180_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "Anthropic's latest Claude 3.5 Sonnet model (200k context).",
  shortDescription: "Anthropic's latest model.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 8192,
  supportsVision: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
  tokenizer: { type: "tiktoken", base: "anthropic_base" },
};
export const CLAUDE_3_7_SONNET_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_3_7_SONNET_20250219_MODEL_ID,
  displayName: "Claude 3.7 Sonnet",
  contextSize: 200_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "Anthropic's latest Claude 3.7 Sonnet model (200k context).",
  shortDescription: "Anthropic's best model.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
  tokenizer: { type: "tiktoken", base: "anthropic_base" },
};
