import type { ModelProviderIdType } from "@app/types";
import {
  GEMINI_2_5_PRO_PREVIEW_MODEL_ID,
  O3_MODEL_ID,
  O4_MINI_MODEL_ID,
} from "@app/types";

export const DEFAULT_REASONING_MODEL_ID = O4_MINI_MODEL_ID;

export const BEST_PERFORMING_REASONING_MODELS_ID = [
  O4_MINI_MODEL_ID,
  O3_MODEL_ID,
  GEMINI_2_5_PRO_PREVIEW_MODEL_ID,
];

const mapProviderIdToDisplayName: Record<ModelProviderIdType, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  mistral: "Mistral",
  google_ai_studio: "Google",
  togetherai: "TogetherAI",
  deepseek: "DeepSeek",
  fireworks: "Fireworks",
  xai: "xAI",
};

export function getProviderDisplayName(
  providerId: ModelProviderIdType
): string {
  return mapProviderIdToDisplayName[providerId] ?? providerId;
}
