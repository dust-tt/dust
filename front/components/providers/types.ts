import {
  AnthropicLogo,
  AnthropicWhiteLogo,
  GoogleLogo,
  MistralLogo,
  OpenaiLogo,
  OpenaiWhiteLogo,
  PlanetIcon,
} from "@dust-tt/sparkle";
import type { ModelConfig, SUPPORTED_MODEL_CONFIGS } from "@dust-tt/types";
import {
  CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
  FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG,
  GEMINI_2_FLASH_LITE_PREVIEW_MODEL_CONFIG,
  GEMINI_2_FLASH_MODEL_CONFIG,
  GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_CONFIG,
  GEMINI_2_PRO_PREVIEW_MODEL_CONFIG,
  GEMINI_FLASH_DEFAULT_MODEL_CONFIG,
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  GPT_4O_MINI_MODEL_CONFIG,
  GPT_4O_MODEL_CONFIG,
  MISTRAL_CODESTRAL_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  O1_HIGH_REASONING_MODEL_CONFIG,
  O1_MINI_MODEL_CONFIG,
  O1_MODEL_CONFIG,
  O3_MINI_HIGH_REASONING_MODEL_CONFIG,
  O3_MINI_MODEL_CONFIG,
} from "@dust-tt/types";
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
    dark: OpenaiWhiteLogo,
  },
  anthropic: {
    light: AnthropicLogo,
    dark: AnthropicWhiteLogo,
  },
  mistral: {
    light: MistralLogo,
  },
  google_ai_studio: {
    light: GoogleLogo,
  },
  togetherai: {
    light: PlanetIcon,
  },
  deepseek: {
    light: PlanetIcon,
  },
  fireworks: {
    light: PlanetIcon,
  },
};

export const getModelProviderLogo = (
  provider: ModelProvider,
  isDark: boolean
) => {
  const logos = MODEL_PROVIDER_LOGOS[provider];
  return isDark && logos.dark ? logos.dark : logos.light;
};
export const USED_MODEL_CONFIGS: readonly ModelConfig[] = [
  GPT_4O_MODEL_CONFIG,
  GPT_4O_MINI_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  O1_MODEL_CONFIG,
  O1_MINI_MODEL_CONFIG,
  O1_HIGH_REASONING_MODEL_CONFIG,
  O3_MINI_MODEL_CONFIG,
  O3_MINI_HIGH_REASONING_MODEL_CONFIG,
  CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  MISTRAL_CODESTRAL_MODEL_CONFIG,
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
  GEMINI_FLASH_DEFAULT_MODEL_CONFIG,
  GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_CONFIG,
  GEMINI_2_FLASH_MODEL_CONFIG,
  GEMINI_2_FLASH_LITE_PREVIEW_MODEL_CONFIG,
  GEMINI_2_PRO_PREVIEW_MODEL_CONFIG,
] as const;

// Sorted by preference order
export const REASONING_MODEL_CONFIGS: ModelConfig[] = [
  O3_MINI_HIGH_REASONING_MODEL_CONFIG,
  FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG,
  O3_MINI_MODEL_CONFIG,
  O1_MODEL_CONFIG,
  GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_CONFIG,
];
