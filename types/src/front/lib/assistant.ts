import { LightAgentConfigurationType } from "../../front/assistant/agent";
import { GenerationTokensEvent } from "../../front/assistant/generation";
import { WorkspaceType } from "../../front/user";
import { ExtractSpecificKeys } from "../../shared/typescipt_utils";
import { ioTsEnum } from "../../shared/utils/iots_utils";

/**
 * PROVIDER IDS
 */

export const MODEL_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "mistral",
  "google_ai_studio",
  "togetherai",
] as const;
export type ModelProviderIdType = (typeof MODEL_PROVIDER_IDS)[number];

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

export function getLargeWhitelistedModel(
  owner: WorkspaceType
): ModelConfigurationType | null {
  if (isProviderWhitelisted(owner, "anthropic")) {
    return CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "openai")) {
    return GPT_4O_MODEL_CONFIG;
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

export const GPT_3_5_TURBO_MODEL_ID = "gpt-3.5-turbo" as const;
export const GPT_4_TURBO_MODEL_ID = "gpt-4-turbo" as const;
export const GPT_4O_MODEL_ID = "gpt-4o" as const;
export const GPT_4O_20240806_MODEL_ID = "gpt-4o-2024-08-06" as const;
export const GPT_4O_MINI_MODEL_ID = "gpt-4o-mini" as const;
export const O1_PREVIEW_MODEL_ID = "o1-preview" as const;
export const O1_MINI_MODEL_ID = "o1-mini" as const;
export const CLAUDE_3_OPUS_2024029_MODEL_ID = "claude-3-opus-20240229" as const;
export const CLAUDE_3_5_SONNET_20240620_MODEL_ID =
  "claude-3-5-sonnet-20240620" as const;
export const CLAUDE_3_5_SONNET_20241022_MODEL_ID =
  "claude-3-5-sonnet-20241022" as const;
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
export const TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID =
  "meta-llama/Llama-3.3-70B-Instruct-Turbo" as const;
export const TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_ID =
  "Qwen/Qwen2.5-Coder-32B-Instruct" as const;
export const TOGETHERAI_QWEN_32B_PREVIEW_MODEL_ID =
  "Qwen/QwQ-32B-Preview" as const;
export const TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_ID =
  "Qwen/Qwen2-72B-Instruct" as const;

export const MODEL_IDS = [
  GPT_3_5_TURBO_MODEL_ID,
  GPT_4_TURBO_MODEL_ID,
  GPT_4O_MODEL_ID,
  GPT_4O_20240806_MODEL_ID,
  GPT_4O_MINI_MODEL_ID,
  O1_PREVIEW_MODEL_ID,
  O1_MINI_MODEL_ID,
  CLAUDE_3_OPUS_2024029_MODEL_ID,
  CLAUDE_3_5_SONNET_20240620_MODEL_ID,
  CLAUDE_3_5_SONNET_20241022_MODEL_ID,
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
  TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID,
  TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_ID,
  TOGETHERAI_QWEN_32B_PREVIEW_MODEL_ID,
  TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_ID,
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

// Should be used for all Open AI models older than gpt-4o-2024-08-06 to prevent issues
// with invalid JSON.
const LEGACY_OPEN_AI_TOOL_USE_META_PROMPT =
  "When using tools, generate valid and properly escaped JSON arguments.";

export const GPT_3_5_TURBO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_3_5_TURBO_MODEL_ID,
  displayName: "GPT 3.5 Turbo",
  contextSize: 16_384,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 24, // 12_288
  largeModel: false,
  description:
    "OpenAI's GPT 3.5 Turbo model, cost-effective and high throughput (16k context).",
  shortDescription: "OpenAI's fast model.",
  isLegacy: false,
  toolUseMetaPrompt: LEGACY_OPEN_AI_TOOL_USE_META_PROMPT,
  supportsVision: false,
};

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
  toolUseMetaPrompt: LEGACY_OPEN_AI_TOOL_USE_META_PROMPT,
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
  supportsVision: true,
};
export const GPT_4O_20240806_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4O_20240806_MODEL_ID,
  displayName: "GPT 4o",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128, // 65_536
  largeModel: true,
  description: "OpenAI's GPT 4o model (128k context).",
  shortDescription: "OpenAI's most advanced model.",
  isLegacy: false,
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
  toolUseMetaPrompt: LEGACY_OPEN_AI_TOOL_USE_META_PROMPT,
  supportsVision: true,
};
export const O1_PREVIEW_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: O1_PREVIEW_MODEL_ID,
  displayName: "O1 Preview",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128, // 65_536
  largeModel: true,
  description:
    "OpenAI's reasoning model designed to solve hard problems across domains (Limited preview access).",
  shortDescription: "OpenAI's reasoning model.",
  isLegacy: false,
  supportsVision: false,
};
export const O1_MINI_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: O1_MINI_MODEL_ID,
  displayName: "O1 Mini",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128, // 65_536
  largeModel: true,
  description:
    "OpenAI's fast reasoning model particularly good at coding, math, and science.",
  shortDescription: "OpenAI's fast reasoning model.",
  isLegacy: false,
  supportsVision: false,
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

const ANTHROPIC_TOOL_USE_META_PROMPT =
  `Immediately before using a tool, think for one short bullet point in \`<thinking>\` tags about ` +
  `how it evaluates against the criteria for a good and bad tool use. ` +
  `After using a tool, think for one short bullet point in \`<thinking>\` tags to evaluate ` +
  `whether the tools results are enough to answer the user's question. ` +
  `The response to the user must be in \`<response>\` tags. ` +
  `There must be a single \`<response>\` after the tools use (if any).`;

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
  toolUseMetaPrompt: ANTHROPIC_TOOL_USE_META_PROMPT,
};

export const CLAUDE_3_5_SONNET_20240620_DEPRECATED_MODEL_CONFIG: ModelConfigurationType =
  {
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
    toolUseMetaPrompt: ANTHROPIC_TOOL_USE_META_PROMPT,
  };

export const CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_3_5_SONNET_20241022_MODEL_ID,
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
  toolUseMetaPrompt: ANTHROPIC_TOOL_USE_META_PROMPT,
};
export const CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
  displayName: "Claude 3.5 Haiku",
  contextSize: 180_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128, // 65_536
  largeModel: false,
  description:
    "Anthropic's Claude 3.5 Haiku model, cost effective and high throughput (200k context).",
  shortDescription: "Anthropic's cost-effective model.",
  isLegacy: false,
  supportsVision: false,
};
export const CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "anthropic",
  modelId: CLAUDE_3_HAIKU_20240307_MODEL_ID,
  displayName: "Claude 3 Haiku",
  contextSize: 180_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128, // 65_536
  largeModel: false,
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

export const TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "togetherai",
    modelId: TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID,
    displayName: "Llama 3.3 70B Instruct Turbo",
    contextSize: 128_000,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 128, // 65_536
    largeModel: true,
    description: "Meta's fast, powerful and open source model (128k context).",
    shortDescription: "Meta's open source model.",
    isLegacy: false,
    supportsVision: false,
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
    supportsVision: false,
  };

export const TOGETHERAI_QWEN_32B_PREVIEW_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "togetherai",
    modelId: TOGETHERAI_QWEN_32B_PREVIEW_MODEL_ID,
    displayName: "Qwen 32B Preview",
    contextSize: 32_000,
    recommendedTopK: 16,
    recommendedExhaustiveTopK: 56, // 28_672
    largeModel: false,
    description: "Alibaba's fast model (32k context).",
    shortDescription: "Alibaba's fast model.",
    isLegacy: false,
    supportsVision: false,
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
    supportsVision: false,
  };

export const SUPPORTED_MODEL_CONFIGS: ModelConfigurationType[] = [
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  GPT_4O_MODEL_CONFIG,
  GPT_4O_20240806_MODEL_CONFIG,
  GPT_4O_MINI_MODEL_CONFIG,
  O1_PREVIEW_MODEL_CONFIG,
  O1_MINI_MODEL_CONFIG,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_5_SONNET_20240620_DEPRECATED_MODEL_CONFIG,
  CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
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
  TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_CONFIG,
  TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_CONFIG,
  TOGETHERAI_QWEN_32B_PREVIEW_MODEL_CONFIG,
  TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_CONFIG,
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
  CLAUDE_3_OPUS = "claude-3-opus",
  CLAUDE_3_SONNET = "claude-3-sonnet",
  CLAUDE_3_HAIKU = "claude-3-haiku",
  CLAUDE_2 = "claude-2",
  CLAUDE_INSTANT = "claude-instant-1",
  MISTRAL_LARGE = "mistral-large",
  MISTRAL_MEDIUM = "mistral-medium",
  //!\ TEMPORARY WORKAROUND: Renaming 'mistral' to 'mistral-small' is not feasible since
  // it interferes with the retrieval of ongoing conversations involving this agent.
  // Needed to preserve ongoing chat integrity due to 'sId=mistral' references in legacy messages.
  MISTRAL_SMALL = "mistral",
  GEMINI_PRO = "gemini-pro",
}

export function getGlobalAgentAuthorName(agentId: string): string {
  switch (agentId) {
    case GLOBAL_AGENTS_SID.GPT4:
      return "OpenAI";
    case GLOBAL_AGENTS_SID.CLAUDE_INSTANT:
    case GLOBAL_AGENTS_SID.CLAUDE_3_OPUS:
    case GLOBAL_AGENTS_SID.CLAUDE_3_SONNET:
    case GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU:
    case GLOBAL_AGENTS_SID.CLAUDE_2:
      return "Anthropic";
    case GLOBAL_AGENTS_SID.MISTRAL_LARGE:
    case GLOBAL_AGENTS_SID.MISTRAL_MEDIUM:
    case GLOBAL_AGENTS_SID.MISTRAL_SMALL:
      return "Mistral";
    case GLOBAL_AGENTS_SID.GEMINI_PRO:
      return "Google";
    default:
      return "Dust";
  }
}

const CUSTOM_ORDER: string[] = [
  GLOBAL_AGENTS_SID.DUST,
  GLOBAL_AGENTS_SID.GPT4,
  GLOBAL_AGENTS_SID.SLACK,
  GLOBAL_AGENTS_SID.NOTION,
  GLOBAL_AGENTS_SID.GOOGLE_DRIVE,
  GLOBAL_AGENTS_SID.GITHUB,
  GLOBAL_AGENTS_SID.INTERCOM,
  GLOBAL_AGENTS_SID.CLAUDE_3_OPUS,
  GLOBAL_AGENTS_SID.CLAUDE_3_SONNET,
  GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU,
  GLOBAL_AGENTS_SID.CLAUDE_2,
  GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
  GLOBAL_AGENTS_SID.MISTRAL_LARGE,
  GLOBAL_AGENTS_SID.MISTRAL_MEDIUM,
  GLOBAL_AGENTS_SID.MISTRAL_SMALL,
  GLOBAL_AGENTS_SID.GEMINI_PRO,
  GLOBAL_AGENTS_SID.HELPER,
];

// This function implements our general strategy to sort agents to users (input bar, assistant list,
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
