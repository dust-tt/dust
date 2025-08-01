import type { WhitelistableFeature } from "../shared/feature_flags";
import type { ExtractSpecificKeys } from "../shared/typescipt_utils";
import { ioTsEnum } from "../shared/utils/iots_utils";
import type { WorkspaceType } from "../user";
import type {
  AgentReasoningEffort,
  LightAgentConfigurationType,
} from "./agent";

/**
 * PROVIDER IDS
 */

export const MODEL_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "mistral",
  "google_ai_studio",
  "togetherai",
  "deepseek",
  "fireworks",
  "xai",
] as const;
export type ModelProviderIdType = (typeof MODEL_PROVIDER_IDS)[number];

export function getProviderDisplayName(
  providerId: ModelProviderIdType
): string {
  switch (providerId) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "mistral":
      return "Mistral";
    case "google_ai_studio":
      return "Google";
    case "togetherai":
      return "TogetherAI";
    case "deepseek":
      return "DeepSeek";
    case "fireworks":
      return "Fireworks";
    case "xai":
      return "xAI";
    default:
      return providerId;
  }
}

export const REASONING_EFFORT_IDS = [
  "none",
  "light",
  "medium",
  "high",
] as const;
export type ReasoningEffortIdType = (typeof REASONING_EFFORT_IDS)[number];

export const isReasoningEffortId = (
  reasoningEffortId: string
): reasoningEffortId is ReasoningEffortIdType =>
  REASONING_EFFORT_IDS.includes(reasoningEffortId as ReasoningEffortIdType);

export const DEFAULT_EMBEDDING_PROVIDER_ID = "openai";
export const EMBEDDING_PROVIDER_IDS = [
  DEFAULT_EMBEDDING_PROVIDER_ID,
  "mistral",
] as const;
export type EmbeddingProviderIdType = (typeof EMBEDDING_PROVIDER_IDS)[number];

export const isModelProviderId = (
  providerId: string
): providerId is ModelProviderIdType =>
  MODEL_PROVIDER_IDS.includes(providerId as ModelProviderIdType);

export const ModelProviderIdCodec =
  ioTsEnum<(typeof MODEL_PROVIDER_IDS)[number]>(MODEL_PROVIDER_IDS);

export const ReasoningEffortCodec =
  ioTsEnum<(typeof REASONING_EFFORT_IDS)[number]>(REASONING_EFFORT_IDS);

export const EmbeddingProviderCodec = ioTsEnum<
  (typeof EMBEDDING_PROVIDER_IDS)[number]
>(EMBEDDING_PROVIDER_IDS);

export function isProviderWhitelisted(
  owner: WorkspaceType,
  providerId: ModelProviderIdType
) {
  const whiteListedProviders = owner.whiteListedProviders ?? MODEL_PROVIDER_IDS;
  return whiteListedProviders.includes(providerId);
}

export function getSmallWhitelistedModel(
  owner: WorkspaceType
): ModelConfigurationType | null {
  if (isProviderWhitelisted(owner, "openai")) {
    return GPT_4_1_MINI_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "anthropic")) {
    return CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "google_ai_studio")) {
    return GEMINI_FLASH_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "mistral")) {
    return MISTRAL_SMALL_MODEL_CONFIG;
  }
  return null;
}

export function getLargeNonAnthropicWhitelistedModel(
  owner: WorkspaceType
): ModelConfigurationType | null {
  if (isProviderWhitelisted(owner, "openai")) {
    return GPT_4_1_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "google_ai_studio")) {
    return GEMINI_PRO_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "mistral")) {
    return MISTRAL_LARGE_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "xai")) {
    return GROK_3_MODEL_CONFIG;
  }
  return null;
}

export function getLargeWhitelistedModel(
  owner: WorkspaceType
): ModelConfigurationType | null {
  if (isProviderWhitelisted(owner, "anthropic")) {
    return CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "openai")) {
    return GPT_4_1_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "google_ai_studio")) {
    return GEMINI_PRO_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "mistral")) {
    return MISTRAL_LARGE_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "xai")) {
    return GROK_3_MODEL_CONFIG;
  }
  return null;
}

/**
 * MODEL IDS
 */

export const GPT_3_5_TURBO_MODEL_ID = "gpt-3.5-turbo" as const;
export const GPT_4_TURBO_MODEL_ID = "gpt-4-turbo" as const;
export const GPT_4O_MODEL_ID = "gpt-4o" as const;
export const GPT_4_1_MODEL_ID = "gpt-4.1-2025-04-14" as const;
export const GPT_4_1_MINI_MODEL_ID = "gpt-4.1-mini-2025-04-14" as const;
export const GPT_4O_20240806_MODEL_ID = "gpt-4o-2024-08-06" as const;
export const GPT_4O_MINI_MODEL_ID = "gpt-4o-mini" as const;
export const O1_MODEL_ID = "o1" as const;
export const O1_MINI_MODEL_ID = "o1-mini" as const;
export const O3_MINI_MODEL_ID = "o3-mini" as const;
export const O3_MODEL_ID = "o3" as const;

export const O4_MINI_MODEL_ID = "o4-mini" as const;
export const CLAUDE_4_OPUS_20250514_MODEL_ID =
  "claude-4-opus-20250514" as const;
export const CLAUDE_4_SONNET_20250514_MODEL_ID =
  "claude-4-sonnet-20250514" as const;
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
export const MISTRAL_LARGE_MODEL_ID = "mistral-large-latest" as const;
export const MISTRAL_MEDIUM_MODEL_ID = "mistral-medium" as const;
export const MISTRAL_SMALL_MODEL_ID = "mistral-small-latest" as const;
export const MISTRAL_CODESTRAL_MODEL_ID = "codestral-latest" as const;

export const GEMINI_1_5_PRO_LATEST_MODEL_ID = "gemini-1.5-pro-latest" as const;
export const GEMINI_1_5_FLASH_LATEST_MODEL_ID =
  "gemini-1.5-flash-latest" as const;
export const GEMINI_2_FLASH_MODEL_ID = "gemini-2.0-flash" as const;
export const GEMINI_2_FLASH_LITE_MODEL_ID = "gemini-2.0-flash-lite" as const;
export const GEMINI_2_5_PRO_PREVIEW_MODEL_ID = "gemini-2.5-pro-preview-03-25";
export const GEMINI_2_5_PRO_MODEL_ID = "gemini-2.5-pro" as const;

// These Gemini preview models are deprecated (either replaced by a GA model or not making it to GA)
export const GEMINI_2_FLASH_PREVIEW_MODEL_ID = "gemini-2.0-flash-exp" as const;
export const GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_ID =
  "gemini-2.0-flash-thinking-exp-01-21" as const;
export const GEMINI_2_FLASH_LITE_PREVIEW_MODEL_ID =
  "gemini-2.0-flash-lite-preview-02-05" as const;
export const GEMINI_2_PRO_PREVIEW_MODEL_ID =
  "gemini-2.0-pro-exp-02-05" as const;

export const TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID =
  "meta-llama/Llama-3.3-70B-Instruct-Turbo" as const;
export const TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_ID =
  "Qwen/Qwen2.5-Coder-32B-Instruct" as const;
export const TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_ID =
  "Qwen/QwQ-32B-Preview" as const;
export const TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_ID =
  "Qwen/Qwen2-72B-Instruct" as const;
export const TOGETHERAI_DEEPSEEK_V3_MODEL_ID =
  "deepseek-ai/DeepSeek-V3" as const;
export const TOGETHERAI_DEEPSEEK_R1_MODEL_ID =
  "deepseek-ai/DeepSeek-R1" as const;
export const DEEPSEEK_CHAT_MODEL_ID = "deepseek-chat" as const;
export const DEEPSEEK_REASONER_MODEL_ID = "deepseek-reasoner" as const;
export const FIREWORKS_DEEPSEEK_R1_MODEL_ID =
  "accounts/fireworks/models/deepseek-r1" as const;
export const FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID =
  "accounts/fireworks/models/kimi-k2-instruct" as const;

export const GROK_3_MODEL_ID = "grok-3-latest" as const;
export const GROK_3_MINI_MODEL_ID = "grok-3-mini-latest" as const;
export const GROK_3_FAST_MODEL_ID = "grok-3-fast-latest" as const;
export const GROK_3_MINI_FAST_MODEL_ID = "grok-3-mini-fast-latest" as const;

export const MODEL_IDS = [
  GPT_3_5_TURBO_MODEL_ID,
  GPT_4_TURBO_MODEL_ID,
  GPT_4O_MODEL_ID,
  GPT_4_1_MODEL_ID,
  GPT_4_1_MINI_MODEL_ID,
  GPT_4O_20240806_MODEL_ID,
  GPT_4O_MINI_MODEL_ID,
  O1_MODEL_ID,
  O1_MINI_MODEL_ID,
  O3_MODEL_ID,
  O3_MINI_MODEL_ID,
  O4_MINI_MODEL_ID,
  CLAUDE_4_OPUS_20250514_MODEL_ID,
  CLAUDE_4_SONNET_20250514_MODEL_ID,
  CLAUDE_3_OPUS_2024029_MODEL_ID,
  CLAUDE_3_5_SONNET_20240620_MODEL_ID,
  CLAUDE_3_5_SONNET_20241022_MODEL_ID,
  CLAUDE_3_7_SONNET_20250219_MODEL_ID,
  CLAUDE_3_HAIKU_20240307_MODEL_ID,
  CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
  CLAUDE_2_1_MODEL_ID,
  CLAUDE_INSTANT_1_2_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
  MISTRAL_MEDIUM_MODEL_ID,
  MISTRAL_SMALL_MODEL_ID,
  MISTRAL_CODESTRAL_MODEL_ID,
  GEMINI_1_5_PRO_LATEST_MODEL_ID,
  GEMINI_1_5_FLASH_LATEST_MODEL_ID,
  GEMINI_2_FLASH_LITE_MODEL_ID,
  GEMINI_2_FLASH_MODEL_ID,
  GEMINI_2_FLASH_LITE_PREVIEW_MODEL_ID,
  GEMINI_2_5_PRO_PREVIEW_MODEL_ID,
  GEMINI_2_PRO_PREVIEW_MODEL_ID,
  GEMINI_2_5_PRO_MODEL_ID,
  GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_ID,
  GEMINI_2_FLASH_PREVIEW_MODEL_ID,
  TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID,
  TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_ID,
  TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_ID,
  TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_ID,
  TOGETHERAI_DEEPSEEK_V3_MODEL_ID,
  TOGETHERAI_DEEPSEEK_R1_MODEL_ID,
  DEEPSEEK_CHAT_MODEL_ID,
  DEEPSEEK_REASONER_MODEL_ID,
  FIREWORKS_DEEPSEEK_R1_MODEL_ID,
  FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID,
  GROK_3_MODEL_ID,
  GROK_3_MINI_MODEL_ID,
  GROK_3_FAST_MODEL_ID,
  GROK_3_MINI_FAST_MODEL_ID,
] as const;
export type ModelIdType = (typeof MODEL_IDS)[number];

export const isModelId = (modelId: string): modelId is ModelIdType =>
  MODEL_IDS.includes(modelId as ModelIdType);

export const ModelIdCodec = ioTsEnum<(typeof MODEL_IDS)[number]>(MODEL_IDS);

/**
 * MODEL CONFIGURATIONS
 */

export type ModelConfigurationType = {
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  displayName: string;
  contextSize: number;
  recommendedTopK: number;
  recommendedExhaustiveTopK: number;
  largeModel: boolean;
  description: string;
  shortDescription: string;
  isLegacy: boolean;
  isLatest: boolean;

  // This meta-prompt is injected into the agent's system instructions if the agent is in a native reasoning context (reasoning effort >= medium).
  nativeReasoningMetaPrompt?: string;

  // Adjust the token count estimation by a ratio. Only needed for anthropic models, where the token count is higher than our estimate
  tokenCountAdjustment?: number;

  // Controls how many output tokens the model can generate
  generationTokensCount: number;

  supportsVision: boolean;

  // Reasoning effort constraints for the model
  minimumReasoningEffort: AgentReasoningEffort;
  maximumReasoningEffort: AgentReasoningEffort;
  defaultReasoningEffort: AgentReasoningEffort;

  // Denotes model is able to take a response format request parameter
  supportsResponseFormat?: boolean;

  featureFlag?: WhitelistableFeature;
  customAssistantFeatureFlag?: WhitelistableFeature;
};

export const GPT_3_5_TURBO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_3_5_TURBO_MODEL_ID,
  displayName: "GPT 3.5 turbo",
  contextSize: 16_384,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 24, // 12_288
  largeModel: false,
  description:
    "OpenAI's GPT 3.5 Turbo model, cost-effective and high throughput (16k context).",
  shortDescription: "OpenAI's fast model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
};

export const GPT_4_TURBO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4_TURBO_MODEL_ID,
  displayName: "GPT 4 turbo",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "OpenAI's GPT 4 Turbo model for complex tasks (128k context).",
  shortDescription: "OpenAI's second best model.",
  isLegacy: false,
  isLatest: false,

  generationTokensCount: 2048,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
};
export const GPT_4O_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4O_MODEL_ID,
  displayName: "GPT 4o",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "OpenAI's GPT 4o model (128k context).",
  shortDescription: "OpenAI's GPT4-o model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 16_384,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
};
export const GPT_4_1_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4_1_MINI_MODEL_ID,
  displayName: "GPT 4.1 mini",
  contextSize: 1_000_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "OpenAI's GPT 4.1 mini model (1M context).",
  shortDescription: "OpenAI's most advanced mini model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 32_000,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
};
export const GPT_4_1_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4_1_MODEL_ID,
  displayName: "GPT 4.1",
  contextSize: 1_000_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "OpenAI's GPT 4.1 model (1M context).",
  shortDescription: "OpenAI's most advanced model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 32_000,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
};
export const GPT_4O_20240806_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4O_20240806_MODEL_ID,
  displayName: "GPT 4o",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "OpenAI's GPT 4o model (128k context).",
  shortDescription: "OpenAI's older most advanced model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 16_384,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
};
export const GPT_4O_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4O_MINI_MODEL_ID,
  displayName: "GPT 4o-mini",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description: "OpenAI's GPT 4o mini model (128k context).",
  shortDescription: "OpenAI's fast model.",
  isLegacy: false,
  isLatest: false,

  generationTokensCount: 16_384,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
};
export const O1_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: O1_MODEL_ID,
  displayName: "o1",
  contextSize: 200_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description:
    "OpenAI's reasoning model designed to solve hard problems across domains (Limited preview access).",
  shortDescription: "OpenAI's reasoning model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  featureFlag: "openai_o1_feature",
  customAssistantFeatureFlag: "openai_o1_custom_assistants_feature",
  supportsResponseFormat: false,
};

export const O1_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: O1_MINI_MODEL_ID,
  displayName: "o1-mini",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description:
    "OpenAI's fast reasoning model particularly good at coding, math, and science.",
  shortDescription: "OpenAI's fast reasoning model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  customAssistantFeatureFlag: "openai_o1_custom_assistants_feature",
  supportsResponseFormat: false,
};

export const O3_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: O3_MODEL_ID,
  displayName: "o3",
  contextSize: 200_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description:
    "OpenAI's most advanced reasoning model particularly good at coding, math, and science.",
  shortDescription: "OpenAI's best reasoning model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: true,
  minimumReasoningEffort: "medium",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "medium",
  supportsResponseFormat: true,
};

export const O3_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: O3_MINI_MODEL_ID,
  displayName: "o3-mini",
  contextSize: 200_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64, // 32_768
  largeModel: true,
  description:
    "OpenAI's fast reasoning model particularly good at coding, math, and science.",
  shortDescription: "OpenAI's fast reasoning model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: false,
  minimumReasoningEffort: "medium",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "medium",
  supportsResponseFormat: true,
};

export const O4_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: O4_MINI_MODEL_ID,
  displayName: "o4-mini",
  contextSize: 200_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "OpenAI's o4 mini model (200k context).",
  shortDescription: "OpenAI's fast o4 model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 64_000,
  supportsVision: true,
  minimumReasoningEffort: "medium",
  maximumReasoningEffort: "high",
  defaultReasoningEffort: "medium",
  supportsResponseFormat: true,
};

export const DEFAULT_TOKEN_COUNT_ADJUSTMENT = 1.15;
const ANTHROPIC_TOKEN_COUNT_ADJUSTMENT = 1.3;

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

const CLAUDE_4_NATIVE_REASONING_META_PROMPT =
  `Never output any text between tool calls, or between tool calls and tool results. ` +
  `Only start outputting text after the last tool call and tool result, once you are ready to provide your final answer.\n`;

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
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
};

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
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
};

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
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
};

export const GEMINI_2_FLASH_LITE_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_2_FLASH_LITE_MODEL_ID,
  displayName: "Gemini Flash 2.0 Lite",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "Google's lightweight large context model (1m context).",
  shortDescription: "Google's lightweight model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
};

// DEPRECATED - Gemini 2.5 pro preview
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
    isLegacy: false,
    isLatest: true,
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

export const TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "togetherai",
    modelId: TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID,
    displayName: "Llama 3.3 70B Instruct Turbo",
    contextSize: 128_000,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64, // 32_768
    largeModel: true,
    description: "Meta's fast, powerful and open source model (128k context).",
    shortDescription: "Meta's open source model.",
    isLegacy: false,
    isLatest: false,
    generationTokensCount: 2048,
    supportsVision: false,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
  };

export const TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "togetherai",
    modelId: TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_ID,
    displayName: "Qwen 2.5 Coder 32B Instruct",
    contextSize: 32_000,
    recommendedTopK: 16,
    recommendedExhaustiveTopK: 56, // 28_672
    largeModel: false,
    description: "Alibaba's fast model for coding (32k context).",
    shortDescription: "Alibaba's fast coding model.",
    isLegacy: false,
    isLatest: false,
    generationTokensCount: 2048,
    supportsVision: false,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
  };

export const TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "togetherai",
    modelId: TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_ID,
    displayName: "Qwen QwQ 32B Preview",
    contextSize: 32_000,
    recommendedTopK: 16,
    recommendedExhaustiveTopK: 56, // 28_672
    largeModel: false,
    description: "Alibaba's fast reasoning model (32k context).",
    shortDescription: "Alibaba's fast reasoning model.",
    isLegacy: false,
    isLatest: false,
    generationTokensCount: 2048,
    supportsVision: false,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
  };

export const TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "togetherai",
    modelId: TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_ID,
    displayName: "Qwen 72B Instruct",
    contextSize: 32_000,
    recommendedTopK: 16,
    recommendedExhaustiveTopK: 56, // 28_672
    largeModel: false,
    description: "Alibaba's powerful model (32k context).",
    shortDescription: "Alibaba's powerful model.",
    isLegacy: false,
    isLatest: false,
    generationTokensCount: 2048,
    supportsVision: false,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
  };

export const TOGETHERAI_DEEPSEEK_V3_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "togetherai",
  modelId: TOGETHERAI_DEEPSEEK_V3_MODEL_ID,
  displayName: "DeepSeek V3 (TogetherAI)",
  contextSize: 131_072,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "DeepSeek's best model (v3, 64k context).",
  shortDescription: "DeepSeek's best model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
};

export const TOGETHERAI_DEEPSEEK_R1_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "togetherai",
  modelId: TOGETHERAI_DEEPSEEK_R1_MODEL_ID,
  displayName: "DeepSeek R1 (TogetherAI)",
  contextSize: 163_840,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "DeepSeek R1 (reasoning, 163k context, served via TogetherAI).",
  shortDescription: "DeepSeek R1 (reasoning model).",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
};

export const DEEPSEEK_CHAT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "deepseek",
  modelId: DEEPSEEK_CHAT_MODEL_ID,
  displayName: "DeepSeek",
  contextSize: 64_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "DeepSeek's best model (v3, 64k context).",
  shortDescription: "DeepSeek's best model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  featureFlag: "deepseek_feature",
};

export const DEEPSEEK_REASONER_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "deepseek",
  modelId: DEEPSEEK_REASONER_MODEL_ID,
  displayName: "DeepSeek R1",
  contextSize: 64_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "DeepSeek's reasoning model (R1, 64k context).",
  shortDescription: "DeepSeek's reasoning model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  featureFlag: "deepseek_feature",
};

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
};

export const GROK_3_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "xai",
  modelId: GROK_3_MODEL_ID,
  displayName: "Grok 3",
  contextSize: 131_072,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "xAI's Grok 3 flagship model (131k context).",
  shortDescription: "xAI's flagship model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 8_192,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  featureFlag: "xai_feature",
};

export const GROK_3_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "xai",
  modelId: GROK_3_MINI_MODEL_ID,
  displayName: "Grok 3 Mini",
  contextSize: 131_072,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: false,
  description: "xAI's Grok 3 Mini model (131k context, reasoning).",
  shortDescription: "xAI's reasoning model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 8_192,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  featureFlag: "xai_feature",
};

export const GROK_3_FAST_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "xai",
  modelId: GROK_3_FAST_MODEL_ID,
  displayName: "Grok 3 Fast",
  contextSize: 131_072,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "xAI's Grok 3 flagship model (131k context, fast infra).",
  shortDescription: "xAI's fast flagship model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 8_192,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  featureFlag: "xai_feature",
};

export const GROK_3_MINI_FAST_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "xai",
  modelId: GROK_3_MINI_FAST_MODEL_ID,
  displayName: "Grok 3 Mini (Fast)",
  contextSize: 131_072,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: false,
  description: "xAI's Grok 3 Mini model (131k context, reasoning, fast infra).",
  shortDescription: "xAI's reasoning model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 8_192,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  featureFlag: "xai_feature",
};

export const SUPPORTED_MODEL_CONFIGS: ModelConfigurationType[] = [
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  GPT_4O_MODEL_CONFIG,
  GPT_4O_20240806_MODEL_CONFIG,
  GPT_4O_MINI_MODEL_CONFIG,
  GPT_4_1_MODEL_CONFIG,
  GPT_4_1_MINI_MODEL_CONFIG,
  O1_MODEL_CONFIG,
  O1_MINI_MODEL_CONFIG,
  O3_MODEL_CONFIG,
  O3_MINI_MODEL_CONFIG,
  O4_MINI_MODEL_CONFIG,
  CLAUDE_4_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_5_SONNET_20240620_DEPRECATED_MODEL_CONFIG,
  CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_7_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_2_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  MISTRAL_CODESTRAL_MODEL_CONFIG,
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
  GEMINI_FLASH_DEFAULT_MODEL_CONFIG,
  GEMINI_2_FLASH_PREVIEW_MODEL_CONFIG,
  GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_CONFIG,
  GEMINI_2_FLASH_MODEL_CONFIG,
  GEMINI_2_FLASH_LITE_PREVIEW_MODEL_CONFIG,
  GEMINI_2_PRO_PREVIEW_MODEL_CONFIG,
  GEMINI_2_5_PRO_MODEL_CONFIG,
  GEMINI_2_5_PRO_PREVIEW_MODEL_CONFIG,
  TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_CONFIG,
  TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_CONFIG,
  TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_CONFIG,
  TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_CONFIG,
  TOGETHERAI_DEEPSEEK_V3_MODEL_CONFIG,
  TOGETHERAI_DEEPSEEK_R1_MODEL_CONFIG,
  DEEPSEEK_CHAT_MODEL_CONFIG,
  DEEPSEEK_REASONER_MODEL_CONFIG,
  FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG,
  FIREWORKS_KIMI_K2_INSTRUCT_MODEL_CONFIG,
  GROK_3_MODEL_CONFIG,
  GROK_3_MINI_MODEL_CONFIG,
  GROK_3_FAST_MODEL_CONFIG,
  GROK_3_MINI_FAST_MODEL_CONFIG,
];

export type ModelConfig = (typeof SUPPORTED_MODEL_CONFIGS)[number];

// this creates a union type of all the {providerId: string, modelId: string}
// pairs that are in SUPPORTED_MODELS
export type SupportedModel = ExtractSpecificKeys<
  (typeof SUPPORTED_MODEL_CONFIGS)[number],
  "providerId" | "modelId"
>;

export function isSupportedModel(model: unknown): model is SupportedModel {
  const maybeSupportedModel = model as SupportedModel;
  return SUPPORTED_MODEL_CONFIGS.some(
    (m) =>
      m.modelId === maybeSupportedModel.modelId &&
      m.providerId === maybeSupportedModel.providerId
  );
}

export function isSupportingResponseFormat(modelId: ModelIdType) {
  const model = SUPPORTED_MODEL_CONFIGS.find(
    (config) => config.modelId === modelId
  );
  return model?.supportsResponseFormat;
}

export type ReasoningModelConfigurationType = {
  modelId: ModelIdType;
  providerId: ModelProviderIdType;
  reasoningEffort: ReasoningEffortIdType | null;
  temperature: number | null;
};

/**
 * Global agent list (stored here to be imported from client-side)
 */

export enum GLOBAL_AGENTS_SID {
  HELPER = "helper",
  DUST = "dust",
  SLACK = "slack",
  GOOGLE_DRIVE = "google_drive",
  NOTION = "notion",
  GITHUB = "github",
  INTERCOM = "intercom",
  GPT35_TURBO = "gpt-3.5-turbo",
  GPT4 = "gpt-4",
  O1 = "o1",
  O1_MINI = "o1-mini",
  O1_HIGH_REASONING = "o1_high",
  O3_MINI = "o3-mini",
  O3 = "o3",
  CLAUDE_4_SONNET = "claude-4-sonnet",
  CLAUDE_3_OPUS = "claude-3-opus",
  CLAUDE_3_SONNET = "claude-3-sonnet",
  CLAUDE_3_HAIKU = "claude-3-haiku",
  CLAUDE_3_7_SONNET = "claude-3-7-sonnet",
  CLAUDE_2 = "claude-2",
  CLAUDE_INSTANT = "claude-instant-1",
  MISTRAL_LARGE = "mistral-large",
  MISTRAL_MEDIUM = "mistral-medium",
  //!\ TEMPORARY WORKAROUND: Renaming 'mistral' to 'mistral-small' is not feasible since
  // it interferes with the retrieval of ongoing conversations involving this agent.
  // Needed to preserve ongoing chat integrity due to 'sId=mistral' references in legacy messages.
  MISTRAL_SMALL = "mistral",
  GEMINI_PRO = "gemini-pro",
  DEEPSEEK_R1 = "deepseek-r1",
}

export function isGlobalAgentId(sId: string): sId is GLOBAL_AGENTS_SID {
  return (Object.values(GLOBAL_AGENTS_SID) as string[]).includes(sId);
}

export function getGlobalAgentAuthorName(agentId: string): string {
  switch (agentId) {
    case GLOBAL_AGENTS_SID.GPT4:
    case GLOBAL_AGENTS_SID.O1:
    case GLOBAL_AGENTS_SID.O1_MINI:
    case GLOBAL_AGENTS_SID.O1_HIGH_REASONING:
    case GLOBAL_AGENTS_SID.O3_MINI:
    case GLOBAL_AGENTS_SID.O3:
      return "OpenAI";
    case GLOBAL_AGENTS_SID.CLAUDE_INSTANT:
    case GLOBAL_AGENTS_SID.CLAUDE_4_SONNET:
    case GLOBAL_AGENTS_SID.CLAUDE_3_OPUS:
    case GLOBAL_AGENTS_SID.CLAUDE_3_SONNET:
    case GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET:
    case GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU:
    case GLOBAL_AGENTS_SID.CLAUDE_2:
      return "Anthropic";
    case GLOBAL_AGENTS_SID.MISTRAL_LARGE:
    case GLOBAL_AGENTS_SID.MISTRAL_MEDIUM:
    case GLOBAL_AGENTS_SID.MISTRAL_SMALL:
      return "Mistral";
    case GLOBAL_AGENTS_SID.GEMINI_PRO:
      return "Google";
    case GLOBAL_AGENTS_SID.DEEPSEEK_R1:
      return "DeepSeek";
    default:
      return "Dust";
  }
}

const CUSTOM_ORDER: string[] = [
  GLOBAL_AGENTS_SID.DUST,
  GLOBAL_AGENTS_SID.CLAUDE_4_SONNET,
  GLOBAL_AGENTS_SID.GPT4,
  GLOBAL_AGENTS_SID.O3_MINI,
  GLOBAL_AGENTS_SID.SLACK,
  GLOBAL_AGENTS_SID.NOTION,
  GLOBAL_AGENTS_SID.GOOGLE_DRIVE,
  GLOBAL_AGENTS_SID.GITHUB,
  GLOBAL_AGENTS_SID.INTERCOM,
  GLOBAL_AGENTS_SID.CLAUDE_3_OPUS,
  GLOBAL_AGENTS_SID.O3,
  GLOBAL_AGENTS_SID.CLAUDE_3_SONNET,
  GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU,
  GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET,
  GLOBAL_AGENTS_SID.CLAUDE_2,
  GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
  GLOBAL_AGENTS_SID.MISTRAL_LARGE,
  GLOBAL_AGENTS_SID.MISTRAL_MEDIUM,
  GLOBAL_AGENTS_SID.MISTRAL_SMALL,
  GLOBAL_AGENTS_SID.GEMINI_PRO,
  GLOBAL_AGENTS_SID.HELPER,
];

// This function implements our general strategy to sort agents to users (input bar, agent list,
// agent suggestions...).
export function compareAgentsForSort(
  a: LightAgentConfigurationType,
  b: LightAgentConfigurationType
) {
  // Place favorites first
  if (a.userFavorite && !b.userFavorite) {
    return -1;
  }
  if (b.userFavorite && !a.userFavorite) {
    return 1;
  }
  // Check for 'dust'
  if (a.sId === GLOBAL_AGENTS_SID.DUST) {
    return -1;
  }
  if (b.sId === GLOBAL_AGENTS_SID.DUST) {
    return 1;
  }

  // Check for 'gpt4'
  if (a.sId === GLOBAL_AGENTS_SID.GPT4) {
    return -1;
  }
  if (b.sId === GLOBAL_AGENTS_SID.GPT4) {
    return 1;
  }

  // Check for agents with non-global 'scope'
  if (a.scope !== "global" && b.scope === "global") {
    return -1;
  }
  if (b.scope !== "global" && a.scope === "global") {
    return 1;
  }

  // Check for customOrder (slack, notion, googledrive, github, claude)
  const aIndex = CUSTOM_ORDER.indexOf(a.sId);
  const bIndex = CUSTOM_ORDER.indexOf(b.sId);

  if (aIndex !== -1 && bIndex !== -1) {
    return aIndex - bIndex; // Both are in customOrder, sort them accordingly
  }

  if (aIndex !== -1) {
    return -1;
  } // Only a is in customOrder, it comes first
  if (bIndex !== -1) {
    return 1;
  } // Only b is in customOrder, it comes first

  // default: sort alphabetically
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
}
