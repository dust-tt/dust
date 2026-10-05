import type {
  ModelProviderIdType,
  WhitelistableModelMakerIdType,
} from "@app/types/assistant/models/types";

// Keyed by model lab, like the `whiteListedProviders` it edits.
export type ProvidersSelection = Record<WhitelistableModelMakerIdType, boolean>;

export const ALL_PROVIDERS_SELECTED: ProvidersSelection = {
  openai: true,
  anthropic: true,
  mistral: true,
  google_ai_studio: true,
  deepseek: true,
  xai: true,
  noop: true,
  auto: true,
  auto_fast: true,
  auto_complex: true,
  zai: true,
  moonshot: true,
  minimax: true,
  thinking_machines: true,
};

export const NO_PROVIDERS_SELECTED: ProvidersSelection = {
  openai: false,
  anthropic: false,
  mistral: false,
  google_ai_studio: false,
  deepseek: false,
  xai: false,
  noop: false,
  auto: true,
  auto_fast: true,
  auto_complex: true,
  zai: false,
  moonshot: false,
  minimax: false,
  thinking_machines: false,
};

export const PRETTIFIED_PROVIDER_NAMES: Record<ModelProviderIdType, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  mistral: "Mistral AI",
  google_ai_studio: "Google",
  deepseek: "Deepseek",
  fireworks: "Fireworks",
  xai: "xAI",
  noop: "noop",
  auto: "Auto",
  auto_fast: "Fast",
  auto_complex: "Complex",
};
