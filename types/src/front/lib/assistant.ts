import { WorkspaceType } from "../../front/user";
import { ExtractSpecificKeys } from "../../shared/typescipt_utils";
import { ioTsEnum } from "../../shared/utils/iots_utils";
import { GenerationTokensEvent } from "./api/assistant/generation";

/**
 * PROVIDER IDS
 */

export const MODEL_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "mistral",
  "google_ai_studio",
] as const;
export type ModelProviderIdType = (typeof MODEL_PROVIDER_IDS)[number];

export const EMBEDDING_PROVIDER_IDS = ["openai", "mistral"] as const;
export type EmbeddingProviderIdType = (typeof EMBEDDING_PROVIDER_IDS)[number];

export const isModelProviderId = (
  providerId: string
): providerId is ModelProviderIdType =>
  MODEL_PROVIDER_IDS.includes(providerId as ModelProviderIdType);

export const ModelProviderIdCodec =
  ioTsEnum<(typeof MODEL_PROVIDER_IDS)[number]>(MODEL_PROVIDER_IDS);

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
    return GPT_4O_MINI_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "anthropic")) {
    return CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "google_ai_studio")) {
    return GEMINI_FLASH_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "mistral")) {
    return MISTRAL_SMALL_MODEL_CONFIG;
  }
  return null;
}

export function getLargeWhitelistedModel(
  owner: WorkspaceType
): ModelConfigurationType | null {
  if (isProviderWhitelisted(owner, "openai")) {
    return GPT_4_TURBO_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "anthropic")) {
    return CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "google_ai_studio")) {
    return GEMINI_PRO_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "mistral")) {
    return MISTRAL_LARGE_MODEL_CONFIG;
  }
  return null;
}

/**
 * MODEL IDS
 */

export const GPT_4_TURBO_MODEL_ID = "gpt-4-turbo" as const;
export const GPT_4O_MODEL_ID = "gpt-4o" as const;
export const GPT_4O_MINI_MODEL_ID = "gpt-4o-mini" as const;
export const CLAUDE_3_OPUS_2024029_MODEL_ID = "claude-3-opus-20240229" as const;
export const CLAUDE_3_5_SONNET_20240620_MODEL_ID =
  "claude-3-5-sonnet-20240620" as const;
export const CLAUDE_3_HAIKU_20240307_MODEL_ID =
  "claude-3-haiku-20240307" as const;
export const CLAUDE_2_1_MODEL_ID = "claude-2.1" as const;
export const CLAUDE_INSTANT_1_2_MODEL_ID = "claude-instant-1.2" as const;
export const MISTRAL_LARGE_MODEL_ID = "mistral-large-latest" as const;
export const MISTRAL_MEDIUM_MODEL_ID = "mistral-medium" as const;
export const MISTRAL_SMALL_MODEL_ID = "mistral-small-latest" as const;
export const MISTRAL_CODESTRAL_MODEL_ID = "codestral-latest" as const;
export const GEMINI_1_5_PRO_LATEST_MODEL_ID = "gemini-1.5-pro-latest" as const;
export const GEMINI_1_5_FLASH_LATEST_MODEL_ID =
  "gemini-1.5-flash-latest" as const;

export const MODEL_IDS = [
  GPT_4_TURBO_MODEL_ID,
  GPT_4O_MODEL_ID,
  GPT_4O_MINI_MODEL_ID,
  CLAUDE_3_OPUS_2024029_MODEL_ID,
  CLAUDE_3_5_SONNET_20240620_MODEL_ID,
  CLAUDE_3_HAIKU_20240307_MODEL_ID,
  CLAUDE_2_1_MODEL_ID,
  CLAUDE_INSTANT_1_2_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
  MISTRAL_MEDIUM_MODEL_ID,
  MISTRAL_SMALL_MODEL_ID,
  MISTRAL_CODESTRAL_MODEL_ID,
  GEMINI_1_5_PRO_LATEST_MODEL_ID,
  GEMINI_1_5_FLASH_LATEST_MODEL_ID,
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

  // Allows configuring parsing of special delimiters in the streamed model output.
  delimitersConfiguration?: {
    delimiters: Array<{
      openingPattern: string;
      closingPattern: string;
      classification: Exclude<
        GenerationTokensEvent["classification"],
        "opening_delimiter" | "closing_delimiter"
      >;
      swallow: boolean;
    }>;
    // If one of these patterns is found at the end of a model event, we'll wait for the
    // the next event before emitting tokens.
    incompleteDelimiterPatterns: RegExp[];
  };

  // This meta-prompt is injected into the assistant's system instructions every time.
  metaPrompt?: string;

  // This meta-prompt is injected into the assistant's system instructions if the assistant is in a tool-use context.
  toolUseMetaPrompt?: string;

  supportsVision: boolean;
};

const OPEN_AI_TOOL_USE_META_PROMPT =
  "When using tools, generate valid and properly escaped JSON arguments.";

export const GPT_4_TURBO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4_TURBO_MODEL_ID,
  displayName: "GPT 4 Turbo",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128, // 65_536
  largeModel: true,
  description: "OpenAI's GPT 4 Turbo model for complex tasks (128k context).",
  shortDescription: "OpenAI's second best model.",
  isLegacy: false,
  toolUseMetaPrompt: OPEN_AI_TOOL_USE_META_PROMPT,
  supportsVision: true,
};
export const GPT_4O_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4O_MODEL_ID,
  displayName: "GPT 4o",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128, // 65_536
  largeModel: true,
  description: "OpenAI's GPT 4o model (128k context).",
  shortDescription: "OpenAI's most advanced model.",
  isLegacy: false,
  toolUseMetaPrompt: OPEN_AI_TOOL_USE_META_PROMPT,
  supportsVision: true,
};
export const GPT_4O_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4O_MINI_MODEL_ID,
  displayName: "GPT 4o mini",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128, // 65_536
  largeModel: true,
  description: "OpenAI's GPT 4o mini model (128k context).",
  shortDescription: "OpenAI's fast model.",
  isLegacy: false,
  toolUseMetaPrompt: OPEN_AI_TOOL_USE_META_PROMPT,
  supportsVision: true,
};

const ANTHROPIC_DELIMITERS_CONFIGURATION = {
  incompleteDelimiterPatterns: [/<\/?[a-zA-Z_]*$/],
  delimiters: [
    {
      openingPattern: "<thinking>",
      closingPattern: "</thinking>",
      classification: "chain_of_thought" as const,
      swallow: false,
    },
    {
      openingPattern: "<search_quality_reflection>",
      closingPattern: "</search_quality_reflection>",
      classification: "chain_of_thought" as const,
      swallow: false,
    },
    {
      openingPattern: "<reflecting>",
      closingPattern: "</reflecting>",
      classification: "chain_of_thought" as const,
      swallow: false,
    },
    {
      openingPattern: "<search_quality_score>",
      closingPattern: "</search_quality_score>",
      classification: "chain_of_thought" as const,
      swallow: true,
    },
    {
      openingPattern: "<result>",
      closingPattern: "</result>",
      classification: "tokens" as const,
      swallow: false,
    },
    {
      openingPattern: "<response>",
      closingPattern: "</response>",
      classification: "tokens" as const,
      swallow: false,
    },
  ],
};

export const CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_3_OPUS_2024029_MODEL_ID,
  displayName: "Claude 3 Opus",
  contextSize: 180_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128, // 65_536
  largeModel: true,
  description: "Anthropic's Claude 3 Opus model (200k context).",
  shortDescription: "Anthropic's largest model.",
  isLegacy: false,
  delimitersConfiguration: ANTHROPIC_DELIMITERS_CONFIGURATION,
  supportsVision: true,
};
export const CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_3_5_SONNET_20240620_MODEL_ID,
  displayName: "Claude 3.5 Sonnet",
  contextSize: 180_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128, // 65_536
  largeModel: true,
  description: "Anthropic's latest Claude 3.5 Sonnet model (200k context).",
  shortDescription: "Anthropic's latest model.",
  isLegacy: false,
  delimitersConfiguration: ANTHROPIC_DELIMITERS_CONFIGURATION,
  supportsVision: true,
};
export const CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_3_HAIKU_20240307_MODEL_ID,
  displayName: "Claude 3 Haiku",
  contextSize: 180_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128, // 65_536
  largeModel: true,
  description:
    "Anthropic's Claude 3 Haiku model, cost effective and high throughput (200k context).",
  shortDescription: "Anthropic's cost-effective model.",
  isLegacy: false,
  supportsVision: true,
};
export const CLAUDE_2_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_2_1_MODEL_ID,
  displayName: "Claude 2.1",
  contextSize: 180_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128, // 65_536
  largeModel: true,
  description: "Anthropic's Claude 2 model (200k context).",
  shortDescription: "Anthropic's legacy model.",
  isLegacy: true,
  supportsVision: false,
};
export const CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_INSTANT_1_2_MODEL_ID,
  displayName: "Claude Instant 1.2",
  contextSize: 90_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128, // 65_536
  largeModel: false,
  description:
    "Anthropic's low-latency and high throughput model (100k context)",
  shortDescription: "Anthropic's legacy model.",
  isLegacy: true,
  supportsVision: false,
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
  supportsVision: false,
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
  supportsVision: false,
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
  supportsVision: false,
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
  supportsVision: false,
};

export const GEMINI_PRO_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_1_5_PRO_LATEST_MODEL_ID,
  displayName: "Gemini Pro 1.5",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 128, // 65_536
  largeModel: true,
  description:
    "Google's best model for scaling across a wide range of tasks (1m context).",
  shortDescription: "Google's large model.",
  isLegacy: false,
  supportsVision: false,
};

export const GEMINI_FLASH_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: GEMINI_1_5_FLASH_LATEST_MODEL_ID,
  displayName: "Gemini Flash 1.5",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 128, // 65_536
  largeModel: true,
  description:
    "Google's lightweight, fast and cost-efficient model (1m context).",
  shortDescription: "Google's cost-effective model.",
  isLegacy: false,
  supportsVision: false,
};

export const SUPPORTED_MODEL_CONFIGS: ModelConfigurationType[] = [
  GPT_4_TURBO_MODEL_CONFIG,
  GPT_4O_MODEL_CONFIG,
  GPT_4O_MINI_MODEL_CONFIG,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_2_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  MISTRAL_CODESTRAL_MODEL_CONFIG,
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
  GEMINI_FLASH_DEFAULT_MODEL_CONFIG,
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
