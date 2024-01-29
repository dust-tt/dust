/**
 * Supported models
 */

import { ExtractSpecificKeys } from "../../shared/typescipt_utils";

export const GPT_4_MODEL_ID = "gpt-4" as const;
export const GPT_4_TURBO_PREVIEW_MODEL_ID = "gpt-4-turbo-preview" as const;
export const GPT_3_5_TURBO_MODEL_ID = "gpt-3.5-turbo-1106" as const;

export const GPT_4_MODEL_CONFIG = {
  providerId: "openai",
  modelId: GPT_4_MODEL_ID,
  displayName: "GPT 4",
  contextSize: 8192,
  recommendedTopK: 16,
  largeModel: true,
};

export const GPT_4_TURBO_MODEL_CONFIG = {
  providerId: "openai",
  modelId: GPT_4_TURBO_PREVIEW_MODEL_ID,
  displayName: "GPT 4",
  contextSize: 128000,
  recommendedTopK: 32,
  largeModel: true,
} as const;

export const GPT_3_5_TURBO_MODEL_CONFIG = {
  providerId: "openai",
  modelId: GPT_3_5_TURBO_MODEL_ID,
  displayName: "GPT 3.5 Turbo",
  contextSize: 16384,
  recommendedTopK: 16,
  largeModel: false,
} as const;

export const CLAUDE_2_1_MODEL_ID = "claude-2.1" as const;
export const CLAUDE_2_MODEL_ID = "claude-2" as const;
export const CLAUDE_INSTANT_1_2_MODEL_ID = "claude-instant-1.2" as const;

export const CLAUDE_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic",
  modelId: CLAUDE_2_1_MODEL_ID,
  displayName: "Claude 2.1",
  contextSize: 200000,
  recommendedTopK: 32,
  largeModel: true,
} as const;

export const CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic",
  modelId: CLAUDE_INSTANT_1_2_MODEL_ID,
  displayName: "Claude Instant 1.2",
  contextSize: 100000,
  recommendedTopK: 32,
  largeModel: false,
} as const;

export const MISTRAL_MEDIUM_MODEL_ID = "mistral-medium" as const;
export const MISTRAL_SMALL_MODEL_ID = "mistral-small" as const;

export const MISTRAL_MEDIUM_MODEL_CONFIG = {
  providerId: "mistral",
  modelId: MISTRAL_MEDIUM_MODEL_ID,
  displayName: "Mistral Medium",
  contextSize: 31500,
  recommendedTopK: 16,
  largeModel: true,
} as const;

export const MISTRAL_SMALL_MODEL_CONFIG = {
  providerId: "mistral",
  modelId: MISTRAL_SMALL_MODEL_ID,
  displayName: "Mistral Small",
  contextSize: 31500,
  recommendedTopK: 16,
  largeModel: false,
} as const;

export const GEMINI_PRO_DEFAULT_MODEL_CONFIG = {
  providerId: "google_vertex_ai",
  modelId: "gemini-pro",
  displayName: "Gemini Pro",
  contextSize: 8192,
  recommendedTopK: 16,
  largeModel: true,
} as const;

export const SUPPORTED_MODEL_CONFIGS = [
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  CLAUDE_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
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
