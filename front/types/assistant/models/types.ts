import { z } from "zod";

import type {
  AgentReasoningEffort,
  EMBEDDING_PROVIDER_IDS,
  ExtractSpecificKeys,
  MODEL_IDS,
  MODEL_PROVIDER_IDS,
  REASONING_EFFORTS,
  SUPPORTED_MODEL_CONFIGS,
  TokenizerConfig,
  WhitelistableFeature,
} from "@app/types";

export type ModelIdType = (typeof MODEL_IDS)[number];
export type ModelProviderIdType = (typeof MODEL_PROVIDER_IDS)[number];

export const CUSTOM_THINKING_TYPES = ["auto", "enabled"] as const;
export type CustomThinkingType = (typeof CUSTOM_THINKING_TYPES)[number];

// Schema for validating model configs (e.g., from GCS at build time).
// This is the source of truth for the structure of ModelConfigurationType.
export const ModelConfigurationSchema = z.object({
  providerId: z.string(),
  modelId: z.string(),
  displayName: z.string(),
  contextSize: z.number(),
  recommendedTopK: z.number(),
  recommendedExhaustiveTopK: z.number(),
  largeModel: z.boolean(),
  description: z.string(),
  shortDescription: z.string(),
  isLegacy: z.boolean(),
  isLatest: z.boolean(),
  nativeReasoningMetaPrompt: z.string().optional(),
  formattingMetaPrompt: z.string().optional(),
  toolUseMetaPrompt: z.string().optional(),
  tokenCountAdjustment: z.number().optional(),
  generationTokensCount: z.number(),
  supportsVision: z.boolean(),
  minimumReasoningEffort: z.string(),
  maximumReasoningEffort: z.string(),
  defaultReasoningEffort: z.string(),
  useNativeLightReasoning: z.boolean().optional(),
  supportsResponseFormat: z.boolean().optional(),
  supportsPromptCaching: z.boolean().optional(),
  featureFlag: z.string().optional(),
  customAssistantFeatureFlag: z.string().optional(),
  tokenizer: z.object({
    type: z.string(),
    base: z.string().optional(),
  }),
  customThinkingType: z.enum(CUSTOM_THINKING_TYPES).optional(),
  customBetas: z.array(z.string()).optional(),
  disablePrefill: z.boolean().optional(),
});

// Base type inferred from the schema.
type ModelConfigurationSchemaType = z.infer<typeof ModelConfigurationSchema>;

// Final type with proper union types for ID and enum fields.
// Derived from schema to ensure structure stays in sync.
export type ModelConfigurationType = Omit<
  ModelConfigurationSchemaType,
  | "providerId"
  | "modelId"
  | "minimumReasoningEffort"
  | "maximumReasoningEffort"
  | "defaultReasoningEffort"
  | "featureFlag"
  | "customAssistantFeatureFlag"
  | "tokenizer"
> & {
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  minimumReasoningEffort: AgentReasoningEffort;
  maximumReasoningEffort: AgentReasoningEffort;
  defaultReasoningEffort: AgentReasoningEffort;
  featureFlag?: WhitelistableFeature;
  customAssistantFeatureFlag?: WhitelistableFeature;
  tokenizer: TokenizerConfig;
};

export type ModelConfig = (typeof SUPPORTED_MODEL_CONFIGS)[number];
// this creates a union type of all the {providerId: string, modelId: string}
// pairs that are in SUPPORTED_MODELS
export type SupportedModel = ExtractSpecificKeys<
  (typeof SUPPORTED_MODEL_CONFIGS)[number],
  "providerId" | "modelId"
>;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export type EmbeddingProviderIdType = (typeof EMBEDDING_PROVIDER_IDS)[number];

export const ResponseFormatSchema = z.object({
  type: z.literal("json_schema"),
  json_schema: z.object({
    name: z.string(),
    schema: z.object({
      type: z.literal("object"),
      properties: z.record(z.unknown()),
      required: z.array(z.string()),
      additionalProperties: z.boolean(),
    }),
    description: z.string().optional(),
    strict: z.boolean().nullable().optional(),
  }),
});
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;
