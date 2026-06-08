import type { ModelProviderIdType } from "@marketing/types/assistant/models/types";

export const MODEL_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "mistral",
  "google_ai_studio",
  "togetherai",
  "deepseek",
  "fireworks",
  "xai",
  "noop",
] as const;

const PROVIDER_DISPLAY_NAMES: Record<ModelProviderIdType, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  mistral: "Mistral",
  google_ai_studio: "Google",
  togetherai: "Together AI",
  deepseek: "DeepSeek",
  fireworks: "Fireworks",
  xai: "xAI",
  noop: "Noop",
};

export function getProviderDisplayName(
  providerId: ModelProviderIdType
): string {
  return PROVIDER_DISPLAY_NAMES[providerId] ?? providerId;
}
