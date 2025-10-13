import type { ModelConfigurationType } from "@app/types";

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
export const CLAUDE_2_1_MODEL_ID = "claude-2.1" as const;
export const CLAUDE_INSTANT_1_2_MODEL_ID = "claude-instant-1.2" as const;
export const ANTHROPIC_TOKEN_COUNT_ADJUSTMENT = 1.3;
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
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 4096,
  supportsVision: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
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
    isLegacy: false,
    isLatest: false,
    generationTokensCount: 8192,
    supportsVision: true,
    minimumReasoningEffort: "light",
    maximumReasoningEffort: "light",
    defaultReasoningEffort: "light",
    tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
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
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 8192,
  supportsVision: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
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
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
};
export const CLAUDE_4_NATIVE_REASONING_META_PROMPT =
  `
When executing multiple tool calls, output text only after all tools have completed.

This restriction applies ONLY to visible text output - you should still use your ` +
  `full internal reasoning and thinking process to plan your approach and analyze results.

Example of what NOT to do:
User: "Analyze our sales data and create a report"
Assistant: "I'll search for the sales data first..."
[search_tool]
Assistant: "Great, now let me create a visualization..."
[create_chart_tool]
Assistant: [final response]

Example of correct behavior:
User: "Analyze our sales data and create a report"
[search_tool]
[create_chart_tool]
Assistant: [final response]

Think deeply and reason internally as needed. Execute all tools first, then provide your complete response.
`;
export const CLAUDE_4_OPUS_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_4_OPUS_20250514_MODEL_ID,
  displayName: "Claude 4 Opus",
  contextSize: 200_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Anthropic's Claude 4 Opus model, the most powerful model in the Claude 4 family (200k context).",
  shortDescription: "Anthropic's most powerful model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 32_000,
  supportsVision: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "light",
  nativeReasoningMetaPrompt: CLAUDE_4_NATIVE_REASONING_META_PROMPT,
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
  featureFlag: "claude_4_opus_feature",
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
  nativeReasoningMetaPrompt: CLAUDE_4_NATIVE_REASONING_META_PROMPT,
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
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
  shortDescription: "Anthropic's latest model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "light",
  nativeReasoningMetaPrompt: CLAUDE_4_NATIVE_REASONING_META_PROMPT,
  tokenCountAdjustment: ANTHROPIC_TOKEN_COUNT_ADJUSTMENT,
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
};
// Deprecated
export const CLAUDE_2_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_2_1_MODEL_ID,
  displayName: "Claude 2.1",
  contextSize: 180_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "Anthropic's Claude 2 model (200k context).",
  shortDescription: "Anthropic's legacy model.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
};
export const CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_INSTANT_1_2_MODEL_ID,
  displayName: "Claude Instant 1.2",
  contextSize: 90_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: false,
  description:
    "Anthropic's low-latency and high throughput model (100k context)",
  shortDescription: "Anthropic's legacy model.",
  isLegacy: true,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "light",
  maximumReasoningEffort: "light",
  defaultReasoningEffort: "light",
};
