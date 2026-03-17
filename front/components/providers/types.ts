export {
  REASONING_MODEL_CONFIGS,
  USED_MODEL_CONFIGS,
} from "@app/components/providers/model_configs";

import type { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import {
  AnthropicLogo,
  DeepseekLogo,
  DustLogo,
  FireworksLogo,
  GeminiLogo,
  GrokLogo,
  MistralLogo,
  OpenaiLogo,
  TogetheraiLogo,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

type ModelProvider = (typeof SUPPORTED_MODEL_CONFIGS)[number]["providerId"];

type ModelProviderLogos = Record<
  ModelProvider,
  {
    light: ComponentType;
    dark?: ComponentType;
  }
>;

const MODEL_PROVIDER_LOGOS: ModelProviderLogos = {
  openai: {
    light: OpenaiLogo,
  },
  anthropic: {
    light: AnthropicLogo,
  },
  mistral: {
    light: MistralLogo,
  },
  google_ai_studio: {
    light: GeminiLogo,
  },
  togetherai: {
    light: TogetheraiLogo,
  },
  deepseek: {
    light: DeepseekLogo,
  },
  fireworks: {
    light: FireworksLogo,
  },
  xai: {
    light: GrokLogo,
  },
  noop: {
    light: DustLogo,
  },
};

export const getModelProviderLogo = (
  provider: ModelProvider,
  isDark: boolean
) => {
  const logos = MODEL_PROVIDER_LOGOS[provider];
  return isDark && logos.dark ? logos.dark : logos.light;
};
