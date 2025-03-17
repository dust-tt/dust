import { AgentReasoningEffort, LightAgentConfigurationType } from "../../front/assistant/agent";
import { GenerationTokensEvent } from "../../front/assistant/generation";
import { WorkspaceType } from "../../front/user";
import { WhitelistableFeature } from "../../shared/feature_flags";
import { ExtractSpecificKeys } from "../../shared/typescipt_utils";
/**
 * PROVIDER IDS
 */
export declare const MODEL_PROVIDER_IDS: readonly ["openai", "anthropic", "mistral", "google_ai_studio", "togetherai", "deepseek", "fireworks"];
export type ModelProviderIdType = (typeof MODEL_PROVIDER_IDS)[number];
export declare const REASONING_EFFORT_IDS: readonly ["low", "medium", "high"];
export type ReasoningEffortIdType = (typeof REASONING_EFFORT_IDS)[number];
export declare const DEFAULT_EMBEDDING_PROVIDER_ID = "openai";
export declare const EMBEDDING_PROVIDER_IDS: readonly ["openai", "mistral"];
export type EmbeddingProviderIdType = (typeof EMBEDDING_PROVIDER_IDS)[number];
export declare const isModelProviderId: (providerId: string) => providerId is "openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks";
export declare const ModelProviderIdCodec: import("io-ts").Type<"openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks", "openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks", unknown>;
export declare const ReasoningEffortCodec: import("io-ts").Type<"low" | "medium" | "high", "low" | "medium" | "high", unknown>;
export declare const EmbeddingProviderCodec: import("io-ts").Type<"openai" | "mistral", "openai" | "mistral", unknown>;
export declare function isProviderWhitelisted(owner: WorkspaceType, providerId: ModelProviderIdType): boolean;
export declare function getSmallWhitelistedModel(owner: WorkspaceType): ModelConfigurationType | null;
export declare function getLargeWhitelistedModel(owner: WorkspaceType): ModelConfigurationType | null;
/**
 * MODEL IDS
 */
export declare const GPT_3_5_TURBO_MODEL_ID: "gpt-3.5-turbo";
export declare const GPT_4_TURBO_MODEL_ID: "gpt-4-turbo";
export declare const GPT_4O_MODEL_ID: "gpt-4o";
export declare const GPT_4O_20240806_MODEL_ID: "gpt-4o-2024-08-06";
export declare const GPT_4O_MINI_MODEL_ID: "gpt-4o-mini";
export declare const O1_MODEL_ID: "o1";
export declare const O1_MINI_MODEL_ID: "o1-mini";
export declare const O3_MINI_MODEL_ID: "o3-mini";
export declare const CLAUDE_3_OPUS_2024029_MODEL_ID: "claude-3-opus-20240229";
export declare const CLAUDE_3_5_SONNET_20240620_MODEL_ID: "claude-3-5-sonnet-20240620";
export declare const CLAUDE_3_5_SONNET_20241022_MODEL_ID: "claude-3-5-sonnet-20241022";
export declare const CLAUDE_3_7_SONNET_20250219_MODEL_ID: "claude-3-7-sonnet-20250219";
export declare const CLAUDE_3_HAIKU_20240307_MODEL_ID: "claude-3-haiku-20240307";
export declare const CLAUDE_3_5_HAIKU_20241022_MODEL_ID: "claude-3-5-haiku-20241022";
export declare const CLAUDE_2_1_MODEL_ID: "claude-2.1";
export declare const CLAUDE_INSTANT_1_2_MODEL_ID: "claude-instant-1.2";
export declare const MISTRAL_LARGE_MODEL_ID: "mistral-large-latest";
export declare const MISTRAL_MEDIUM_MODEL_ID: "mistral-medium";
export declare const MISTRAL_SMALL_MODEL_ID: "mistral-small-latest";
export declare const MISTRAL_CODESTRAL_MODEL_ID: "codestral-latest";
export declare const GEMINI_1_5_PRO_LATEST_MODEL_ID: "gemini-1.5-pro-latest";
export declare const GEMINI_1_5_FLASH_LATEST_MODEL_ID: "gemini-1.5-flash-latest";
export declare const GEMINI_2_FLASH_PREVIEW_MODEL_ID: "gemini-2.0-flash-exp";
export declare const GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_ID: "gemini-2.0-flash-thinking-exp-01-21";
export declare const GEMINI_2_FLASH_MODEL_ID: "gemini-2.0-flash";
export declare const GEMINI_2_FLASH_LITE_PREVIEW_MODEL_ID: "gemini-2.0-flash-lite-preview-02-05";
export declare const GEMINI_2_PRO_PREVIEW_MODEL_ID: "gemini-2.0-pro-exp-02-05";
export declare const TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID: "meta-llama/Llama-3.3-70B-Instruct-Turbo";
export declare const TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_ID: "Qwen/Qwen2.5-Coder-32B-Instruct";
export declare const TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_ID: "Qwen/QwQ-32B-Preview";
export declare const TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_ID: "Qwen/Qwen2-72B-Instruct";
export declare const TOGETHERAI_DEEPSEEK_V3_MODEL_ID: "deepseek-ai/DeepSeek-V3";
export declare const TOGETHERAI_DEEPSEEK_R1_MODEL_ID: "deepseek-ai/DeepSeek-R1";
export declare const DEEPSEEK_CHAT_MODEL_ID: "deepseek-chat";
export declare const DEEPSEEK_REASONER_MODEL_ID: "deepseek-reasoner";
export declare const FIREWORKS_DEEPSEEK_R1_MODEL_ID: "accounts/fireworks/models/deepseek-r1";
export declare const MODEL_IDS: readonly ["gpt-3.5-turbo", "gpt-4-turbo", "gpt-4o", "gpt-4o-2024-08-06", "gpt-4o-mini", "o1", "o1-mini", "o3-mini", "claude-3-opus-20240229", "claude-3-5-sonnet-20240620", "claude-3-5-sonnet-20241022", "claude-3-7-sonnet-20250219", "claude-3-haiku-20240307", "claude-3-5-haiku-20241022", "claude-2.1", "claude-instant-1.2", "mistral-large-latest", "mistral-medium", "mistral-small-latest", "codestral-latest", "gemini-1.5-pro-latest", "gemini-1.5-flash-latest", "gemini-2.0-flash-exp", "gemini-2.0-flash-thinking-exp-01-21", "gemini-2.0-flash", "gemini-2.0-flash-lite-preview-02-05", "gemini-2.0-pro-exp-02-05", "meta-llama/Llama-3.3-70B-Instruct-Turbo", "Qwen/Qwen2.5-Coder-32B-Instruct", "Qwen/QwQ-32B-Preview", "Qwen/Qwen2-72B-Instruct", "deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1", "deepseek-chat", "deepseek-reasoner", "accounts/fireworks/models/deepseek-r1"];
export type ModelIdType = (typeof MODEL_IDS)[number];
export declare const isModelId: (modelId: string) => modelId is "gpt-3.5-turbo" | "gpt-4-turbo" | "gpt-4o" | "gpt-4o-2024-08-06" | "gpt-4o-mini" | "o1" | "o1-mini" | "o3-mini" | "claude-3-opus-20240229" | "claude-3-5-sonnet-20240620" | "claude-3-5-sonnet-20241022" | "claude-3-7-sonnet-20250219" | "claude-3-haiku-20240307" | "claude-3-5-haiku-20241022" | "claude-2.1" | "claude-instant-1.2" | "mistral-large-latest" | "mistral-medium" | "mistral-small-latest" | "codestral-latest" | "gemini-1.5-pro-latest" | "gemini-1.5-flash-latest" | "gemini-2.0-flash-exp" | "gemini-2.0-flash-thinking-exp-01-21" | "gemini-2.0-flash" | "gemini-2.0-flash-lite-preview-02-05" | "gemini-2.0-pro-exp-02-05" | "meta-llama/Llama-3.3-70B-Instruct-Turbo" | "Qwen/Qwen2.5-Coder-32B-Instruct" | "Qwen/QwQ-32B-Preview" | "Qwen/Qwen2-72B-Instruct" | "deepseek-ai/DeepSeek-V3" | "deepseek-ai/DeepSeek-R1" | "deepseek-chat" | "deepseek-reasoner" | "accounts/fireworks/models/deepseek-r1";
export declare const ModelIdCodec: import("io-ts").Type<"gpt-3.5-turbo" | "gpt-4-turbo" | "gpt-4o" | "gpt-4o-2024-08-06" | "gpt-4o-mini" | "o1" | "o1-mini" | "o3-mini" | "claude-3-opus-20240229" | "claude-3-5-sonnet-20240620" | "claude-3-5-sonnet-20241022" | "claude-3-7-sonnet-20250219" | "claude-3-haiku-20240307" | "claude-3-5-haiku-20241022" | "claude-2.1" | "claude-instant-1.2" | "mistral-large-latest" | "mistral-medium" | "mistral-small-latest" | "codestral-latest" | "gemini-1.5-pro-latest" | "gemini-1.5-flash-latest" | "gemini-2.0-flash-exp" | "gemini-2.0-flash-thinking-exp-01-21" | "gemini-2.0-flash" | "gemini-2.0-flash-lite-preview-02-05" | "gemini-2.0-pro-exp-02-05" | "meta-llama/Llama-3.3-70B-Instruct-Turbo" | "Qwen/Qwen2.5-Coder-32B-Instruct" | "Qwen/QwQ-32B-Preview" | "Qwen/Qwen2-72B-Instruct" | "deepseek-ai/DeepSeek-V3" | "deepseek-ai/DeepSeek-R1" | "deepseek-chat" | "deepseek-reasoner" | "accounts/fireworks/models/deepseek-r1", "gpt-3.5-turbo" | "gpt-4-turbo" | "gpt-4o" | "gpt-4o-2024-08-06" | "gpt-4o-mini" | "o1" | "o1-mini" | "o3-mini" | "claude-3-opus-20240229" | "claude-3-5-sonnet-20240620" | "claude-3-5-sonnet-20241022" | "claude-3-7-sonnet-20250219" | "claude-3-haiku-20240307" | "claude-3-5-haiku-20241022" | "claude-2.1" | "claude-instant-1.2" | "mistral-large-latest" | "mistral-medium" | "mistral-small-latest" | "codestral-latest" | "gemini-1.5-pro-latest" | "gemini-1.5-flash-latest" | "gemini-2.0-flash-exp" | "gemini-2.0-flash-thinking-exp-01-21" | "gemini-2.0-flash" | "gemini-2.0-flash-lite-preview-02-05" | "gemini-2.0-pro-exp-02-05" | "meta-llama/Llama-3.3-70B-Instruct-Turbo" | "Qwen/Qwen2.5-Coder-32B-Instruct" | "Qwen/QwQ-32B-Preview" | "Qwen/Qwen2-72B-Instruct" | "deepseek-ai/DeepSeek-V3" | "deepseek-ai/DeepSeek-R1" | "deepseek-chat" | "deepseek-reasoner" | "accounts/fireworks/models/deepseek-r1", unknown>;
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
    delimitersConfiguration?: {
        delimiters: Array<{
            openingPattern: string;
            closingPattern: string;
            classification: Exclude<GenerationTokensEvent["classification"], "opening_delimiter" | "closing_delimiter">;
            swallow: boolean;
        }>;
        incompleteDelimiterPatterns: RegExp[];
    };
    metaPrompt?: string;
    toolUseMetaPrompt?: string;
    tokenCountAdjustment?: number;
    generationTokensCount: number;
    supportsVision: boolean;
    reasoningEffort?: AgentReasoningEffort;
    featureFlag?: WhitelistableFeature;
    customAssistantFeatureFlag?: WhitelistableFeature;
};
export declare const GPT_3_5_TURBO_MODEL_CONFIG: ModelConfigurationType;
export declare const GPT_4_TURBO_MODEL_CONFIG: ModelConfigurationType;
export declare const GPT_4O_MODEL_CONFIG: ModelConfigurationType;
export declare const GPT_4O_20240806_MODEL_CONFIG: ModelConfigurationType;
export declare const GPT_4O_MINI_MODEL_CONFIG: ModelConfigurationType;
export declare const O1_MODEL_CONFIG: ModelConfigurationType;
export declare const O1_HIGH_REASONING_MODEL_CONFIG: ModelConfigurationType;
export declare const O1_MINI_MODEL_CONFIG: ModelConfigurationType;
export declare const O3_MINI_MODEL_CONFIG: ModelConfigurationType;
export declare const O3_MINI_HIGH_REASONING_MODEL_CONFIG: ModelConfigurationType;
export declare const CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG: ModelConfigurationType;
export declare const CLAUDE_3_5_SONNET_20240620_DEPRECATED_MODEL_CONFIG: ModelConfigurationType;
export declare const CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG: ModelConfigurationType;
export declare const CLAUDE_3_7_SONNET_DEFAULT_MODEL_CONFIG: ModelConfigurationType;
export declare const CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG: ModelConfigurationType;
export declare const CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG: ModelConfigurationType;
export declare const CLAUDE_2_DEFAULT_MODEL_CONFIG: ModelConfigurationType;
export declare const CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG: ModelConfigurationType;
export declare const MISTRAL_LARGE_MODEL_CONFIG: ModelConfigurationType;
export declare const MISTRAL_MEDIUM_MODEL_CONFIG: ModelConfigurationType;
export declare const MISTRAL_SMALL_MODEL_CONFIG: ModelConfigurationType;
export declare const MISTRAL_CODESTRAL_MODEL_CONFIG: ModelConfigurationType;
export declare const GEMINI_PRO_DEFAULT_MODEL_CONFIG: ModelConfigurationType;
export declare const GEMINI_FLASH_DEFAULT_MODEL_CONFIG: ModelConfigurationType;
export declare const GEMINI_2_FLASH_PREVIEW_MODEL_CONFIG: ModelConfigurationType;
export declare const GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_CONFIG: ModelConfigurationType;
export declare const GEMINI_2_FLASH_MODEL_CONFIG: ModelConfigurationType;
export declare const GEMINI_2_FLASH_LITE_PREVIEW_MODEL_CONFIG: ModelConfigurationType;
export declare const GEMINI_2_PRO_PREVIEW_MODEL_CONFIG: ModelConfigurationType;
export declare const TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_CONFIG: ModelConfigurationType;
export declare const TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_CONFIG: ModelConfigurationType;
export declare const TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_CONFIG: ModelConfigurationType;
export declare const TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_CONFIG: ModelConfigurationType;
export declare const TOGETHERAI_DEEPSEEK_V3_MODEL_CONFIG: ModelConfigurationType;
export declare const TOGETHERAI_DEEPSEEK_R1_MODEL_CONFIG: ModelConfigurationType;
export declare const DEEPSEEK_CHAT_MODEL_CONFIG: ModelConfigurationType;
export declare const DEEPSEEK_REASONER_MODEL_CONFIG: ModelConfigurationType;
export declare const FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG: ModelConfigurationType;
export declare const SUPPORTED_MODEL_CONFIGS: ModelConfigurationType[];
export type ModelConfig = (typeof SUPPORTED_MODEL_CONFIGS)[number];
export type SupportedModel = ExtractSpecificKeys<(typeof SUPPORTED_MODEL_CONFIGS)[number], "providerId" | "modelId" | "reasoningEffort">;
export declare function isSupportedModel(model: unknown): model is SupportedModel;
/**
 * Global agent list (stored here to be imported from client-side)
 */
export declare enum GLOBAL_AGENTS_SID {
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
    CLAUDE_3_OPUS = "claude-3-opus",
    CLAUDE_3_SONNET = "claude-3-sonnet",
    CLAUDE_3_HAIKU = "claude-3-haiku",
    CLAUDE_3_7_SONNET = "claude-3-7-sonnet",
    CLAUDE_2 = "claude-2",
    CLAUDE_INSTANT = "claude-instant-1",
    MISTRAL_LARGE = "mistral-large",
    MISTRAL_MEDIUM = "mistral-medium",
    MISTRAL_SMALL = "mistral",
    GEMINI_PRO = "gemini-pro",
    DEEPSEEK_R1 = "deepseek-r1"
}
export declare function getGlobalAgentAuthorName(agentId: string): string;
export declare function compareAgentsForSort(a: LightAgentConfigurationType, b: LightAgentConfigurationType): number;
//# sourceMappingURL=assistant.d.ts.map