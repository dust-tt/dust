export { USED_MODEL_CONFIGS } from "@app/components/providers/model_configs";

import type { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import {
  AnthropicLogo,
  DeepseekLogo,
  DustLogo,
  FireworksLogo,
  GeminiLogo,
  GrokLogo,
  MinimaxLogo,
  MistralLogo,
  MoonshotLogo,
  OpenaiLogo,
  ZaiLogo,
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
  auto: {
    light: DustLogo,
  },
  auto_fast: {
    light: DustLogo,
  },
  auto_complex: {
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

// Resolve the logo for a model maker (lab). Lab-only makers have their own
// logos; provider-shared makers fall through to the provider logo.
export const getModelMakerLogo = (
  makerId: ModelMakerIdType,
  isDark: boolean
): ComponentType => {
  switch (makerId) {
    case "zai":
      return ZaiLogo;
    case "moonshot":
      return MoonshotLogo;
    case "minimax":
      return MinimaxLogo;
    default:
      return getModelProviderLogo(makerId, isDark);
  }
};
