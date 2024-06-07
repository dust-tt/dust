import {
  AnthropicLogo,
  GoogleLogo,
  MistralLogo,
  OpenaiLogo,
} from "@dust-tt/sparkle";
import type { ModelConfig, SUPPORTED_MODEL_CONFIGS } from "@dust-tt/types";
import {
  CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_SONNET_DEFAULT_MODEL_CONFIG,
  GEMINI_FLASH_DEFAULT_MODEL_CONFIG,
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  GPT_4O_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
} from "@dust-tt/types";
import type { ComponentType } from "react";

type ModelProvider = (typeof SUPPORTED_MODEL_CONFIGS)[number]["providerId"];

export const MODEL_PROVIDER_LOGOS: Record<ModelProvider, ComponentType> = {
  openai: OpenaiLogo,
  anthropic: AnthropicLogo,
  mistral: MistralLogo,
  google_ai_studio: GoogleLogo,
};

export const USED_MODEL_CONFIGS: readonly ModelConfig[] = [
  GPT_4_TURBO_MODEL_CONFIG,
  GPT_4O_MODEL_CONFIG,
  GPT_3_5_TURBO_MODEL_CONFIG,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
  GEMINI_FLASH_DEFAULT_MODEL_CONFIG,
] as const;
