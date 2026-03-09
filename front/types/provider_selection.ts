import type { ModelProviderIdType } from "@app/types/assistant/models/types";

export type ProvidersSelection = Record<ModelProviderIdType, boolean>;

export const ALL_PROVIDERS_SELECTED: ProvidersSelection = {
  openai: true,
  anthropic: true,
  mistral: true,
  google_ai_studio: true,
  togetherai: true,
  deepseek: true,
  fireworks: true,
  xai: true,
  noop: true,
};

export const NO_PROVIDERS_SELECTED: ProvidersSelection = {
  openai: false,
  anthropic: false,
  mistral: false,
  google_ai_studio: false,
  togetherai: false,
  deepseek: false,
  fireworks: false,
  xai: false,
  noop: false,
};
