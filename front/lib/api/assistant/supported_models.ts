import { ExtractSpecificKeys } from "@app/lib/api/typescipt_utils";

export const GPT_4_DEFAULT_MODEL_CONFIG = {
  providerId: "openai",
  modelId: "gpt-4-32k",
  displayName: "GPT 4",
  contextSize: 32768,
} as const;

export const GPT_3_5_TURBO_DEFAULT_MODEL_CONFIG = {
  providerId: "openai",
  modelId: "gpt-3.5-turbo",
  displayName: "GPT 3.5 Turbo",
  contextSize: 4096,
} as const;

export const CLAUDE_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic",
  modelId: "claude-2",
  displayName: "Claude 2",
  contextSize: 100000,
} as const;

export const CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic",
  modelId: "claude-instant-1.2",
  displayName: "Claude Instant 1.2",
  contextSize: 100000,
} as const;

export const SUPPORTED_MODEL_CONFIGS = [
  GPT_3_5_TURBO_DEFAULT_MODEL_CONFIG,
  GPT_4_DEFAULT_MODEL_CONFIG,
  {
    providerId: "openai",
    modelId: "gpt-4",
    displayName: "GPT 4",
    contextSize: 8192,
  },
  CLAUDE_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
] as const;

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

export function getSupportedModelConfig(supportedModel: SupportedModel) {
  // here it is safe to cast the result to non-nullable because SupportedModel
  // is derived from the const array of configs above
  return SUPPORTED_MODEL_CONFIGS.find(
    (m) =>
      m.modelId === supportedModel.modelId &&
      m.providerId === supportedModel.providerId
  ) as (typeof SUPPORTED_MODEL_CONFIGS)[number];
}
