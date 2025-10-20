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

import type { ModelConfig, SUPPORTED_MODEL_CONFIGS } from "@app/types";
import {
  CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG,
  FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG,
  FIREWORKS_KIMI_K2_INSTRUCT_MODEL_CONFIG,
  GEMINI_2_5_FLASH_LITE_MODEL_CONFIG,
  GEMINI_2_5_FLASH_MODEL_CONFIG,
  GEMINI_2_5_PRO_MODEL_CONFIG,
  GPT_4_1_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  GPT_4O_MINI_MODEL_CONFIG,
  GPT_4O_MODEL_CONFIG,
  GPT_5_MINI_MODEL_CONFIG,
  GPT_5_MODEL_CONFIG,
  GPT_5_NANO_MODEL_CONFIG,
  GROK_3_MODEL_CONFIG,
  GROK_4_FAST_NON_REASONING_MODEL_CONFIG,
  GROK_4_MODEL_CONFIG,
  MISTRAL_CODESTRAL_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  O1_MODEL_CONFIG,
  O3_MINI_MODEL_CONFIG,
  O3_MODEL_CONFIG,
  O4_MINI_MODEL_CONFIG,
} from "@app/types";

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
export const USED_MODEL_CONFIGS: readonly ModelConfig[] = [
  GPT_5_MODEL_CONFIG,
  GPT_5_MINI_MODEL_CONFIG,
  GPT_5_NANO_MODEL_CONFIG,
  GPT_4O_MODEL_CONFIG,
  GPT_4O_MINI_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  GPT_4_1_MODEL_CONFIG,
  O1_MODEL_CONFIG,
  O3_MODEL_CONFIG,
  O3_MINI_MODEL_CONFIG,
  O4_MINI_MODEL_CONFIG,
  CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_OPUS_DEFAULT_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  MISTRAL_CODESTRAL_MODEL_CONFIG,
  GEMINI_2_5_PRO_MODEL_CONFIG,
  GEMINI_2_5_FLASH_MODEL_CONFIG,
  GEMINI_2_5_FLASH_LITE_MODEL_CONFIG,
  FIREWORKS_KIMI_K2_INSTRUCT_MODEL_CONFIG,
  GROK_3_MODEL_CONFIG,
  GROK_4_MODEL_CONFIG,
  GROK_4_FAST_NON_REASONING_MODEL_CONFIG,
] as const;

// Sorted by preference order
export const REASONING_MODEL_CONFIGS: ModelConfig[] = [
  O1_MODEL_CONFIG,
  O3_MODEL_CONFIG,
  O3_MINI_MODEL_CONFIG,
  O4_MINI_MODEL_CONFIG,
  FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG,
  FIREWORKS_KIMI_K2_INSTRUCT_MODEL_CONFIG,
  GEMINI_2_5_PRO_MODEL_CONFIG,
  GEMINI_2_5_FLASH_MODEL_CONFIG,
  GEMINI_2_5_FLASH_LITE_MODEL_CONFIG,
  GROK_4_MODEL_CONFIG,
];
