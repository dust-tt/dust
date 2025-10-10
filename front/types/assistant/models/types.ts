import type {
  AgentReasoningEffort,
  EMBEDDING_PROVIDER_IDS,
  ExtractSpecificKeys,
  MODEL_IDS,
  MODEL_PROVIDER_IDS,
  REASONING_EFFORT_IDS,
  SUPPORTED_MODEL_CONFIGS,
  WhitelistableFeature,
} from "@app/types";

export type ModelIdType = (typeof MODEL_IDS)[number];
export type ModelProviderIdType = (typeof MODEL_PROVIDER_IDS)[number];
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

  // This meta-prompt is always injected into the agent's system instructions.
  formattingMetaPrompt?: string;

  // This meta-prompt is injected if the agent has tools available.
  toolUseMetaPrompt?: string;

  // Adjust the token count estimation by a ratio. Only needed for anthropic models, where the token count is higher than our estimate
  tokenCountAdjustment?: number;

  // Controls how many output tokens the model can generate
  generationTokensCount: number;

  supportsVision: boolean;

  // Reasoning effort constraints for the model
  minimumReasoningEffort: AgentReasoningEffort;
  maximumReasoningEffort: AgentReasoningEffort;
  defaultReasoningEffort: AgentReasoningEffort;

  // If set to true, we'll pass the "light" reasoning effort to `core`. Otherwise, we'll
  // use chain of thought prompting.
  useNativeLightReasoning?: boolean;

  // Denotes model is able to take a response format request parameter
  supportsResponseFormat?: boolean;

  featureFlag?: WhitelistableFeature;
  customAssistantFeatureFlag?: WhitelistableFeature;
};

export type ModelConfig = (typeof SUPPORTED_MODEL_CONFIGS)[number];
// this creates a union type of all the {providerId: string, modelId: string}
// pairs that are in SUPPORTED_MODELS
export type SupportedModel = ExtractSpecificKeys<
  (typeof SUPPORTED_MODEL_CONFIGS)[number],
  "providerId" | "modelId"
>;
export type ReasoningEffortIdType = (typeof REASONING_EFFORT_IDS)[number];
export type ReasoningModelConfigurationType = {
  modelId: ModelIdType;
  providerId: ModelProviderIdType;
  reasoningEffort: ReasoningEffortIdType | null;
  temperature: number | null;
};
export type EmbeddingProviderIdType = (typeof EMBEDDING_PROVIDER_IDS)[number];
