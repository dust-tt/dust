/**
 * Supported models
 */

import { ExtractSpecificKeys } from "../../shared/typescipt_utils";

export const GPT_4_MODEL_ID = "gpt-4" as const;
export const GPT_4_TURBO_PREVIEW_MODEL_ID = "gpt-4-turbo-preview" as const;
export const GPT_3_5_TURBO_MODEL_ID = "gpt-3.5-turbo-1106" as const;

const GPT_4_DESCRIPTION =
  "OpenAI's most powerful and recent model (128k context).";
const GPT_4_SHORT_DESCRIPTION = "OpenAI's smartest model.";

export const GPT_4_MODEL_CONFIG = {
  providerId: "openai" as const,
  modelId: GPT_4_MODEL_ID,
  displayName: "GPT 4",
  contextSize: 8192,
  recommendedTopK: 16,
  largeModel: true,
  description: GPT_4_DESCRIPTION,
  shortDescription: GPT_4_SHORT_DESCRIPTION,
};

export const GPT_4_TURBO_MODEL_CONFIG = {
  providerId: "openai" as const,
  modelId: GPT_4_TURBO_PREVIEW_MODEL_ID,
  displayName: "GPT 4",
  contextSize: 128000,
  recommendedTopK: 32,
  largeModel: true,
  description: GPT_4_DESCRIPTION,
  shortDescription: GPT_4_SHORT_DESCRIPTION,
} as const;

export const GPT_3_5_TURBO_MODEL_CONFIG = {
  providerId: "openai" as const,
  modelId: GPT_3_5_TURBO_MODEL_ID,
  displayName: "GPT 3.5 Turbo",
  contextSize: 16384,
  recommendedTopK: 16,
  largeModel: false,
  description:
    "OpenAI's cost-effective and high throughput model (16k context).",
  shortDescription: "OpenAI's fast model.",
} as const;

export const CLAUDE_3_OPUS_2024029_MODEL_ID = "claude-3-opus-20240229" as const;
export const CLAUDE_3_SONNET_2024029_MODEL_ID =
  "claude-3-sonnet-20240229" as const;
export const CLAUDE_2_1_MODEL_ID = "claude-2.1" as const;
export const CLAUDE_INSTANT_1_2_MODEL_ID = "claude-instant-1.2" as const;

export const CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic" as const,
  modelId: CLAUDE_3_OPUS_2024029_MODEL_ID,
  displayName: "Claude 3 Opus",
  contextSize: 200000,
  recommendedTopK: 32,
  largeModel: true,
  description:
    "Anthropic's Claude 3 Opus model, most powerful model for highly complex tasks.",
  shortDescription: "Anthropic's powerful model.",
} as const;

export const CLAUDE_3_SONNET_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic" as const,
  modelId: CLAUDE_3_SONNET_2024029_MODEL_ID,
  displayName: "Claude 3 Sonnet",
  contextSize: 200000,
  recommendedTopK: 32,
  largeModel: true,
  description:
    "Anthropic Claude 3 Sonnet model, targeting balance between intelligence and speed for enterprise workloads.",
  shortDescription: "Anthropic's balanced model.",
} as const;

export const CLAUDE_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic" as const,
  modelId: CLAUDE_2_1_MODEL_ID,
  displayName: "Claude 2.1",
  contextSize: 200000,
  recommendedTopK: 32,
  largeModel: true,
  description: "Anthropic's Claude 2 model (200k context).",
  shortDescription: "Anthropic's smartest model.",
} as const;

export const CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic" as const,
  modelId: CLAUDE_INSTANT_1_2_MODEL_ID,
  displayName: "Claude Instant 1.2",
  contextSize: 100000,
  recommendedTopK: 32,
  largeModel: false,
  description:
    "Anthropic's low-latency and high throughput model (100k context)",
  shortDescription: "Anthropic's fast model.",
} as const;

export const MISTRAL_LARGE_MODEL_ID = "mistral-large-latest" as const;
export const MISTRAL_MEDIUM_MODEL_ID = "mistral-medium" as const;
export const MISTRAL_SMALL_MODEL_ID = "mistral-small" as const;

export const MISTRAL_LARGE_MODEL_CONFIG = {
  providerId: "mistral" as const,
  modelId: MISTRAL_LARGE_MODEL_ID,
  displayName: "Mistral Large",
  contextSize: 31500,
  recommendedTopK: 16,
  largeModel: true,
  description: "Mistral's latest `large` model (32k context).",
  shortDescription: "Mistral's large model.",
} as const;

export const MISTRAL_MEDIUM_MODEL_CONFIG = {
  providerId: "mistral" as const,
  modelId: MISTRAL_MEDIUM_MODEL_ID,
  displayName: "Mistral Medium",
  contextSize: 31500,
  recommendedTopK: 16,
  largeModel: true,
  description: "Mistral's latest `medium` model (32k context).",
  shortDescription: "Mistral's smartest model.",
} as const;

export const MISTRAL_SMALL_MODEL_CONFIG = {
  providerId: "mistral" as const,
  modelId: MISTRAL_SMALL_MODEL_ID,
  displayName: "Mistral Small",
  contextSize: 31500,
  recommendedTopK: 16,
  largeModel: false,
  description: "Mistral's latest model (8x7B Instruct, 32k context).",
  shortDescription: "Mistral's fast model.",
} as const;

export const GEMINI_PRO_DEFAULT_MODEL_CONFIG = {
  providerId: "google_vertex_ai" as const,
  modelId: "gemini-pro",
  displayName: "Gemini Pro",
  contextSize: 8192,
  recommendedTopK: 16,
  largeModel: true,
  description:
    "Google's best model for scaling across a wide range of tasks (8k context).",
  shortDescription: "Google's smartest model.",
} as const;

export const SUPPORTED_MODEL_CONFIGS = [
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
] as const;

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
