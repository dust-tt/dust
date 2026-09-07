import { SUPPORTED_REGIONS } from "@app/types/region";
import { z } from "zod";
import type { WhitelistableFeature } from "../../shared/feature_flags";
import { isWhitelistableFeature } from "../../shared/feature_flags";
import type { ExtractSpecificKeys } from "../../shared/typescipt_utils";
import type { TokenizerConfig } from "../../tokenizer";
import type { EMBEDDING_PROVIDER_IDS } from "./embedding";
import type { SUPPORTED_MODEL_CONFIGS } from "./models";
import { MODEL_IDS } from "./models";
import type { BYOK_MODEL_PROVIDER_IDS } from "./providers";
import { MODEL_MAKER_IDS, MODEL_PROVIDER_IDS } from "./providers";
import { ORDERED_REASONING_EFFORTS } from "./reasoning";

export type ModelIdType = (typeof MODEL_IDS)[number];
export type ModelProviderIdType = (typeof MODEL_PROVIDER_IDS)[number];
export type ByokModelProviderIdType = (typeof BYOK_MODEL_PROVIDER_IDS)[number];
export type ModelMakerIdType = (typeof MODEL_MAKER_IDS)[number];

export const CUSTOM_THINKING_TYPES = ["auto", "enabled"] as const;
export type CustomThinkingType = (typeof CUSTOM_THINKING_TYPES)[number];

// Raw model selection coming from the input-bar model picker: an explicit
// provider/model pick, with an optional reasoning-effort override.
export const ModelSelectionSchema = z.object({
  providerId: z.enum(MODEL_PROVIDER_IDS),
  modelId: z.enum(MODEL_IDS),
  reasoningEffort: z.enum(ORDERED_REASONING_EFFORTS).optional(),
});
export type ModelSelectionType = z.infer<typeof ModelSelectionSchema>;

// A concrete model resolved from a picker selection at message-send time.
export type ResolvedRequestedModel = {
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  reasoningEffort: ReasoningEffort;
};

// How an agent message's model was resolved: "agent" (ran the agent's own
// configured model, no override), "user" (ran a per-message model picked from
// the input-bar picker), "auto" (resolved through the auto model),
// "auto_fast" / "auto_complex" (resolved through a curated stream tier), or
// "fair_use_downgrade" (premium was asked for but the user's weekly premium
// allowance was spent, so the message ran the Standard stream instead).
export const MODEL_RESOLUTION_METHODS = [
  "agent",
  "user",
  "auto",
  "auto_fast",
  "auto_complex",
  "fair_use_downgrade",
] as const;
export type ModelResolutionMethodType =
  (typeof MODEL_RESOLUTION_METHODS)[number];

export const isModelResolutionMethod = (
  value: string
): value is ModelResolutionMethodType =>
  MODEL_RESOLUTION_METHODS.includes(value as ModelResolutionMethodType);

// z.object (not z.record) so every reasoning effort key is required.
const ReasoningEffortSupportSchema = z.object({
  none: z.boolean(),
  light: z.boolean(),
  medium: z.boolean(),
  high: z.boolean(),
} satisfies Record<ReasoningEffort, z.ZodBoolean>);
export type ReasoningEffortSupport = z.infer<
  typeof ReasoningEffortSupportSchema
>;

const WhitelistableFeatureSchema = z.custom<WhitelistableFeature>(
  isWhitelistableFeature,
  { message: "Invalid feature flag" }
);

const AvailabilityConditionSchema = z.object({
  creditPricedPlan: z.boolean().optional(),
  plansWithAdvancedModels: z.boolean().optional(),
  featureFlag: WhitelistableFeatureSchema.optional(),
});

const CustomAvailabilityConditionSchema = z.object({
  featureFlag: WhitelistableFeatureSchema.optional(),
});

// Schema for validating model configs (e.g., from GCS at build time).
// This is the source of truth for the structure of ModelConfigurationType.
export const ModelConfigurationSchema = z.object({
  providerId: z.string(),
  modelMaker: z.enum(MODEL_MAKER_IDS).optional(),
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
  formattingMetaPrompt: z.string().optional(),
  toolUseMetaPrompt: z.string().optional(),
  tokenCountAdjustment: z.number().optional(),
  generationTokensCount: z.number(),
  supportsVision: z.boolean(),
  supportedReasoningEfforts: ReasoningEffortSupportSchema,
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
  // Ordered list of fallback model ids (3 max), sent as the `fallbacks` param on
  // Anthropic streaming requests so the API retries on these models when the
  // primary model's safety classifiers decline the request.
  // https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback#server-side-fallback
  fallbackModels: z.array(z.string()).optional(),
  // If true, the model is served through the dedicated EAP (Early Access
  // Program) Anthropic API key (ANTHROPIC_EAP_API_KEY) instead of the
  // workspace's Dust-managed / BYOK credentials, for models hosted in a
  // separate Anthropic workspace. Only consulted for Anthropic models;
  // ignored for other providers.
  useEapKey: z.boolean().optional(),
  disablePrefill: z.boolean().optional(),
  supportsBatchProcessing: z.boolean().optional(),
  // If true, the model supports deferring rarely-used tool definitions out of
  // its active context until searched/discovered on demand. Must not be enabled
  // based on a feature flag alone, since unsupported models reject the request.
  supportsToolSearch: z.boolean().optional(),
  // Specify if the model is available in specific regions.
  regionalAvailability: z.record(z.enum(SUPPORTED_REGIONS), z.boolean()),
  availableIfOneOf: AvailabilityConditionSchema.optional(),
  customAvailableIf: CustomAvailabilityConditionSchema.optional(),
});

// Base type inferred from the schema.
type ModelConfigurationSchemaType = z.infer<typeof ModelConfigurationSchema>;

// Final type with proper union types for ID and enum fields.
// Derived from schema to ensure structure stays in sync.
export type ModelConfigurationType = Omit<
  ModelConfigurationSchemaType,
  | "providerId"
  | "modelId"
  | "defaultReasoningEffort"
  | "featureFlag"
  | "customAssistantFeatureFlag"
  | "tokenizer"
> & {
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  defaultReasoningEffort: ReasoningEffort;
  // If undefined, model is available.
  // If object is empty, model is not available.
  // If defined, model must satisfy one of the conditions to be available.
  availableIfOneOf?: {
    // If set to true, model is available for credit-priced plans.
    creditPricedPlan?: boolean;
    // If set to true, model is available for plans with advanced models access.
    plansWithAdvancedModels?: boolean;
    // If set, model is available if feature flag is enabled.
    featureFlag?: WhitelistableFeature;
  };
  // Pre-requisite: must be available.
  tokenizer: TokenizerConfig;
};

export type ModelConfig = (typeof SUPPORTED_MODEL_CONFIGS)[number];
// this creates a union type of all the {providerId: string, modelId: string}
// pairs that are in SUPPORTED_MODELS
export type SupportedModel = ExtractSpecificKeys<
  (typeof SUPPORTED_MODEL_CONFIGS)[number],
  "providerId" | "modelId"
>;
export type ReasoningEffort = (typeof ORDERED_REASONING_EFFORTS)[number];

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

export function getAvailableReasoningEfforts(
  support: ReasoningEffortSupport
): ReasoningEffort[] {
  return ORDERED_REASONING_EFFORTS.filter((effort) => support[effort]);
}

export function getMinimumReasoningEffort(
  support: ReasoningEffortSupport
): ReasoningEffort {
  return ORDERED_REASONING_EFFORTS.find((effort) => support[effort]) || "none";
}

export function getMaximumReasoningEffort(
  support: ReasoningEffortSupport
): ReasoningEffort {
  return getAvailableReasoningEfforts(support).at(-1) || "none";
}
