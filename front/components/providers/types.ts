export { USED_MODEL_CONFIGS } from "@app/types/assistant/models/used_model_configs";

import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import type { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import { getModelMaker } from "@app/types/assistant/models/providers";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import {
  AnthropicLogo,
  DeepseekLogo,
  DustLogoSquare,
  FireworksLogo,
  GeminiLogo,
  GrokLogo,
  MinimaxLogo,
  MistralLogo,
  MoonshotLogo,
  OpenaiLogo,
  ThinkingMachinesLogo,
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
    light: DustLogoSquare,
  },
  auto: {
    light: DustLogoSquare,
  },
  auto_fast: {
    light: DustLogoSquare,
  },
  auto_complex: {
    light: DustLogoSquare,
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
    case "thinking_machines":
      return ThinkingMachinesLogo;
    default:
      return getModelProviderLogo(makerId, isDark);
  }
};

// Resolve the logo for a model known only by its modelId. Returns undefined for
// models we no longer support.
export const getModelLogoByModelId = (
  modelId: string,
  isDark: boolean
): ComponentType | undefined => {
  const modelConfig = getModelConfigByModelId(modelId);
  return modelConfig
    ? getModelMakerLogo(getModelMaker(modelConfig), isDark)
    : undefined;
};
