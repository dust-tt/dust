import type { StaticModelIdType } from "@app/types/assistant/models/models";

// All pricing are in USD per million tokens (equivalent to micro-USD per token).
type TokenPricingRates = {
  input: number;
  output: number;
  // Cache write rate. For providers that bill by cache retention duration, this is the short-lived
  // rate and long_cache_creation_input_tokens the long-lived one.
  cache_creation_input_tokens?: number;
  long_cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type PricingEntry = TokenPricingRates & {
  long_context?: TokenPricingRates & {
    prompt_token_threshold: number;
  };
};

// Pricing for current models (USD per million tokens - equivalent to micro-USD per token)
// This record contains all static model IDs. Custom models use default pricing.
const CURRENT_MODEL_PRICING: Record<StaticModelIdType, PricingEntry> = {
  // Verified 2026-08-26: https://developers.openai.com/api/docs/pricing
  // Promotional pricing is available at least through 2026-11-21; re-verify after that date.
  "gpt-5.6-sol": {
    input: 4.0,
    output: 20.0,
    cache_creation_input_tokens: 5.0,
    cache_read_input_tokens: 0.4,
    long_context: {
      prompt_token_threshold: 272_001,
      input: 8.0,
      output: 30.0,
      cache_creation_input_tokens: 10.0,
      cache_read_input_tokens: 0.8,
    },
  },
  // https://openai.com/api/pricing
  "gpt-5.6-terra": {
    input: 2.0,
    output: 12.0,
    cache_creation_input_tokens: 2.5,
    cache_read_input_tokens: 0.2,
    long_context: {
      prompt_token_threshold: 272_001,
      input: 4.0,
      output: 18.0,
      cache_creation_input_tokens: 5.0,
      cache_read_input_tokens: 0.4,
    },
  },
  // Verified 2026-08-19: https://developers.openai.com/api/docs/models/gpt-5.6-terra
  // Prompts above 272K input tokens cost 2x input and 1.5x output for the full request.
  "gpt-5.6-terra-long-context": {
    input: 2.0,
    output: 12.0,
    cache_creation_input_tokens: 2.5,
    cache_read_input_tokens: 0.2,
    long_context: {
      // `computeTokensCostForUsageInMicroUsd` switches tiers inclusively.
      prompt_token_threshold: 272_001,
      input: 4.0,
      output: 18.0,
      cache_creation_input_tokens: 5.0,
      cache_read_input_tokens: 0.4,
    },
  },
  // https://openai.com/api/pricing
  "gpt-5.6-luna": {
    input: 0.2,
    output: 1.2,
    cache_creation_input_tokens: 0.25,
    cache_read_input_tokens: 0.02,
    long_context: {
      prompt_token_threshold: 272_001,
      input: 0.4,
      output: 1.8,
      cache_creation_input_tokens: 0.5,
      cache_read_input_tokens: 0.04,
    },
  },
  // Verified 2026-08-21: https://developers.openai.com/api/docs/models/gpt-5.5
  "gpt-5.5": {
    input: 5.0,
    output: 30.0,
    cache_read_input_tokens: 0.5,
    long_context: {
      prompt_token_threshold: 272_001,
      input: 10.0,
      output: 45.0,
      cache_read_input_tokens: 1.0,
    },
  },
  // Verified 2026-08-21: https://developers.openai.com/api/docs/models/gpt-5.4
  "gpt-5.4": {
    input: 2.5,
    output: 15.0,
    cache_read_input_tokens: 0.25,
    long_context: {
      prompt_token_threshold: 272_001,
      input: 5.0,
      output: 22.5,
      cache_read_input_tokens: 0.5,
    },
  },
  // https://openai.com/api/pricing/
  "gpt-5.4-mini": {
    input: 0.75,
    output: 4.5,
    cache_read_input_tokens: 0.075,
  },
  // https://openai.com/api/pricing/
  "gpt-5.4-nano": {
    input: 0.2,
    output: 1.25,
    cache_read_input_tokens: 0.02,
  },
  "gpt-5.2": {
    input: 1.75,
    output: 14.0,
    cache_read_input_tokens: 0.175,
  },
  "gpt-5.1": {
    input: 1.25,
    output: 10.0,
    cache_read_input_tokens: 0.125,
  },
  "gpt-5": {
    input: 1.25,
    output: 10.0,
    cache_read_input_tokens: 0.125,
  },
  "gpt-5-mini": {
    input: 0.25,
    output: 2.0,
    cache_read_input_tokens: 0.025,
  },
  "gpt-5-nano": {
    input: 0.05,
    output: 0.4,
    cache_read_input_tokens: 0.005,
  },
  "gpt-4-turbo": {
    input: 10.0,
    output: 30.0,
  },
  "gpt-3.5-turbo": {
    input: 1.5,
    output: 2.0,
  },
  "gpt-4o-mini": {
    input: 0.15,
    output: 0.6,
  },
  "gpt-4o": {
    input: 2.5,
    output: 10.0,
  },
  "gpt-4o-2024-08-06": {
    input: 2.5,
    output: 10.0,
    cache_read_input_tokens: 1.25,
  },
  o1: {
    input: 15.0,
    output: 60.0,
  },
  "o1-mini": {
    input: 3.0,
    output: 12.0,
    cache_read_input_tokens: 1.5,
  },
  o3: {
    input: 15.0,
    output: 60.0,
  },
  "o3-mini": {
    input: 1.1,
    output: 4.4,
  },
  "o4-mini": {
    input: 1.1,
    output: 4.4,
  },
  "gpt-4.1-mini-2025-04-14": {
    input: 0.4,
    output: 1.6,
  },
  "gpt-4.1-2025-04-14": {
    input: 2.0,
    output: 8.0,
  },
  "claude-4-opus-20250514": {
    input: 15.0,
    output: 75.0,
    cache_creation_input_tokens: 18.75,
    long_cache_creation_input_tokens: 30.0,
    cache_read_input_tokens: 1.5,
  },
  "claude-4-sonnet-20250514": {
    input: 3.0,
    output: 15.0,
    cache_creation_input_tokens: 3.75,
    long_cache_creation_input_tokens: 6.0,
    cache_read_input_tokens: 0.3,
  },
  "claude-sonnet-4-5-20250929": {
    input: 3.0,
    output: 15.0,
    cache_creation_input_tokens: 3.75,
    long_cache_creation_input_tokens: 6.0,
    cache_read_input_tokens: 0.3,
  },
  "claude-opus-4-5-20251101": {
    input: 5.0,
    output: 25.0,
    cache_creation_input_tokens: 6.25,
    long_cache_creation_input_tokens: 10.0,
    cache_read_input_tokens: 0.5,
  },
  "claude-opus-4-6": {
    input: 5.0,
    output: 25.0,
    cache_creation_input_tokens: 6.25,
    long_cache_creation_input_tokens: 10.0,
    cache_read_input_tokens: 0.5,
  },
  "claude-opus-4-7": {
    input: 5.0,
    output: 25.0,
    cache_creation_input_tokens: 6.25,
    long_cache_creation_input_tokens: 10.0,
    cache_read_input_tokens: 0.5,
  },
  "claude-opus-4-8": {
    input: 5.0,
    output: 25.0,
    cache_creation_input_tokens: 6.25,
    long_cache_creation_input_tokens: 10.0,
    cache_read_input_tokens: 0.5,
  },
  "claude-opus-5": {
    input: 5.0,
    output: 25.0,
    cache_creation_input_tokens: 6.25,
    long_cache_creation_input_tokens: 10.0,
    cache_read_input_tokens: 0.5,
  },
  // https://platform.claude.com/docs/en/about-claude/models/overview
  "claude-fable-5": {
    input: 10.0,
    output: 50.0,
    cache_creation_input_tokens: 12.5,
    long_cache_creation_input_tokens: 20.0,
    cache_read_input_tokens: 1.0,
  },
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cache_creation_input_tokens: 3.75,
    long_cache_creation_input_tokens: 6.0,
    cache_read_input_tokens: 0.3,
  },
  // https://platform.claude.com/docs/en/about-claude/pricing
  // TODO(2026-08-31): intro pricing ends; revert to standard rates
  // (input 3.0, output 15.0, cache_creation 3.75, cache_read 0.3).
  "claude-sonnet-5": {
    input: 2.0,
    output: 10.0,
    cache_creation_input_tokens: 2.5,
    long_cache_creation_input_tokens: 4.0,
    cache_read_input_tokens: 0.2,
  },
  "claude-3-opus-20240229": {
    input: 15.0,
    output: 75.0,
    cache_creation_input_tokens: 18.75,
    long_cache_creation_input_tokens: 30.0,
    cache_read_input_tokens: 1.5,
  },
  "claude-3-5-sonnet-20240620": {
    input: 3.0,
    output: 15.0,
    cache_creation_input_tokens: 3.75,
    long_cache_creation_input_tokens: 6.0,
    cache_read_input_tokens: 0.3,
  },
  "claude-3-5-sonnet-20241022": {
    input: 3.0,
    output: 15.0,
    cache_creation_input_tokens: 3.75,
    long_cache_creation_input_tokens: 6.0,
    cache_read_input_tokens: 0.3,
  },
  "claude-3-7-sonnet-20250219": {
    input: 3.0,
    output: 15.0,
    cache_creation_input_tokens: 3.75,
    long_cache_creation_input_tokens: 6.0,
    cache_read_input_tokens: 0.3,
  },
  "claude-3-haiku-20240307": {
    input: 0.25,
    output: 1.25,
    cache_creation_input_tokens: 0.3,
    long_cache_creation_input_tokens: 0.5,
    cache_read_input_tokens: 0.03,
  },
  "claude-3-5-haiku-20241022": {
    input: 1.0,
    output: 5.0,
    cache_creation_input_tokens: 1.25,
    long_cache_creation_input_tokens: 2.0,
    cache_read_input_tokens: 0.1,
  },
  "claude-haiku-4-5-20251001": {
    input: 1.0,
    output: 5.0,
    cache_creation_input_tokens: 1.25,
    long_cache_creation_input_tokens: 2.0,
    cache_read_input_tokens: 0.1,
  },
  "mistral-large-latest": {
    input: 2.0,
    output: 6.0,
  },
  "mistral-medium": {
    input: 2.5,
    output: 7.5,
  },
  // No cache pricing published by Mistral for medium 3.5 as of 2026-05-19.
  "mistral-medium-3-5": {
    input: 1.5,
    output: 7.5,
  },
  "mistral-small-latest": {
    input: 0.9,
    output: 2.8,
  },
  "codestral-latest": {
    input: 0.9,
    output: 2.8,
  },
  // https://ai.google.dev/gemini-api/docs/pricing: 2/12 up to 200k input tokens,
  // 4/18 beyond that.
  "gemini-3-pro-preview": {
    input: 2,
    output: 12,
    long_context: {
      prompt_token_threshold: 200_001,
      input: 4,
      output: 18,
    },
  },
  // Gemini 3.1 Pro: same pricing structure as 3 Pro (2/12 for <=200k, 4/18 for >200k).
  "gemini-3.1-pro-preview": {
    input: 2,
    output: 12,
    long_context: {
      prompt_token_threshold: 200_001,
      input: 4,
      output: 18,
    },
  },
  "gemini-3-flash-preview": {
    input: 0.5,
    output: 3.0,
    cache_read_input_tokens: 0.05,
  },
  // Flat pricing as of 2026-05-19 launch (no <=/>200k tiered SKU).
  "gemini-3.5-flash": {
    input: 1.5,
    output: 9.0,
    cache_read_input_tokens: 0.15,
  },
  // https://ai.google.dev/gemini-api/docs/pricing (2026-07-25): promotional
  // pricing through 2026-12-31; reverts to $1.50/$7.50/$0.15 on 2027-01-01 —
  // update this then.
  "gemini-3.6-flash": {
    input: 0.75,
    output: 3.75,
    cache_read_input_tokens: 0.075,
  },
  // https://ai.google.dev/gemini-api/docs/pricing (2026-08-14): same rates as
  // 3.6 Flash. Promotional pricing through 2026-12-31; reverts to
  // $1.50/$7.50/$0.15 on 2027-01-01 — update this then.
  "gemini-3.7-flash": {
    input: 0.75,
    output: 3.75,
    cache_read_input_tokens: 0.075,
  },
  // https://ai.google.dev/gemini-api/docs/pricing (2026-09-04): standard
  // pricing from 2027-01-01, excluding the introductory promotion.
  "gemini-3.8-flash": {
    input: 1.5,
    output: 7.5,
    cache_read_input_tokens: 0.15,
  },
  "gemini-2.5-flash": {
    input: 0.15,
    output: 0.6,
  },
  "gemini-2.5-flash-lite": {
    input: 0.075,
    output: 0.3,
  },
  "gemini-3.1-flash-lite": {
    input: 0.25,
    output: 1.5,
    cache_read_input_tokens: 0.025,
  },
  // https://ai.google.dev/gemini-api/docs/pricing (2026-07-25): matches the
  // Flash-Lite family rate.
  "gemini-3.5-flash-lite": {
    input: 0.25,
    output: 1.5,
    cache_read_input_tokens: 0.025,
  },
  // Deprecated: superseded by gemini-3.1-flash-lite. Kept until existing agents are migrated.
  "gemini-3.1-flash-lite-preview": {
    input: 0.25,
    output: 1.5,
    cache_read_input_tokens: 0.025,
  },
  "gemini-2.5-pro": {
    input: 1.25,
    output: 15.0,
  },
  "deepseek-chat": {
    input: 0.14,
    output: 0.28,
  },
  // https://fireworks.ai/models/fireworks/deepseek-v3p2
  "accounts/fireworks/models/deepseek-v3p2": {
    input: 0.56,
    output: 1.68,
    cache_read_input_tokens: 0.28,
  },
  // https://fireworks.ai/models/deepseek-ai/deepseek-v4-flash-0731
  "accounts/fireworks/models/deepseek-v4-flash-0731": {
    input: 0.14,
    output: 0.28,
    cache_read_input_tokens: 0.028,
  },
  // https://fireworks.ai/models/fireworks/deepseek-v4-pro
  "accounts/fireworks/models/deepseek-v4-pro": {
    input: 1.74,
    output: 3.48,
    cache_read_input_tokens: 0.14,
  },
  // https://fireworks.ai/models/fireworks/kimi-k2-instruct-0905
  "accounts/fireworks/models/kimi-k2-instruct-0905": {
    input: 0.6,
    output: 2.5,
    cache_read_input_tokens: 0.3,
  },
  // https://fireworks.ai/models/fireworks/kimi-k2p5
  "accounts/fireworks/models/kimi-k2p5": {
    input: 0.6,
    output: 3.0,
    cache_read_input_tokens: 0.1,
  },
  // https://fireworks.ai/models/fireworks/kimi-k2p6
  "accounts/fireworks/models/kimi-k2p6": {
    input: 0.95,
    output: 4.0,
    cache_read_input_tokens: 0.16,
  },
  // https://docs.fireworks.ai/serverless/pricing
  "accounts/fireworks/models/kimi-k3": {
    input: 3.75,
    output: 18.75,
    cache_read_input_tokens: 0.375,
  },
  // https://app.fireworks.ai/models/fireworks/minimax-m2p5
  "accounts/fireworks/models/minimax-m2p5": {
    input: 0.3,
    output: 0.2,
    cache_read_input_tokens: 0.029,
  },
  // https://app.fireworks.ai/models/fireworks/glm-5
  "accounts/fireworks/models/glm-5": {
    input: 0.01,
    output: 0.2,
    cache_read_input_tokens: 0.002,
  },
  // https://fireworks.ai/models/fireworks/glm-5p2
  "accounts/fireworks/models/glm-5p2": {
    input: 1.4,
    output: 4.4,
    cache_read_input_tokens: 0.26,
  },
  // Verified 2026-08-31: https://fireworks.ai/models/fireworks/glm-5p3-flash
  "accounts/fireworks/models/glm-5p3-flash": {
    input: 0.15,
    output: 0.5,
    cache_read_input_tokens: 0.029,
  },
  // Verified 2026-08-14: https://fireworks.ai/models/fireworks/inkling
  "accounts/fireworks/models/inkling": {
    input: 1.0,
    output: 4.05,
    cache_read_input_tokens: 0.17,
  },
  "grok-3-latest": {
    input: 2.0,
    output: 10.0,
  },
  "grok-3-mini-latest": {
    input: 0.2,
    output: 1.0,
  },
  // https://docs.x.ai/developers/models/grok-4.5
  "grok-4.5": {
    input: 2.0,
    output: 6.0,
    cache_read_input_tokens: 0.3,
    long_context: {
      prompt_token_threshold: 200_000,
      input: 4.0,
      output: 12.0,
      cache_read_input_tokens: 0.6,
    },
  },
  // Verified 2026-08-12: https://docs.x.ai/developers/pricing
  "grok-4.6": {
    input: 2.0,
    output: 6.0,
    cache_read_input_tokens: 0.5,
    long_context: {
      prompt_token_threshold: 200_000,
      input: 4.0,
      output: 12.0,
      cache_read_input_tokens: 1.0,
    },
  },
  "grok-4-latest": {
    input: 1.25,
    output: 2.5,
  },
  // Retired May 15, 2026 — redirected to grok-4.3 by xAI at these rates.
  "grok-4-1-fast-reasoning-latest": {
    input: 1.25,
    output: 2.5,
  },
  "grok-4-1-fast-non-reasoning-latest": {
    input: 1.25,
    output: 2.5,
  },
  "grok-4-fast-non-reasoning-latest": {
    input: 1.25,
    output: 2.5,
  },
  "grok-4-fast-reasoning-latest": {
    input: 1.25,
    output: 2.5,
  },
  noop: {
    input: 0,
    output: 0,
  },
  // Fake model for auto selection.
  // This model is not real and is used to select the best model for the task.
  // It is not used for actual generation.
  auto: {
    input: 0,
    output: 0,
    cache_read_input_tokens: 0,
  },
  auto_fast: {
    input: 0,
    output: 0,
    cache_read_input_tokens: 0,
  },
  auto_complex: {
    input: 0,
    output: 0,
    cache_read_input_tokens: 0,
  },
};

const IMAGE_MODEL_PRICING: Record<string, PricingEntry> = {
  "gemini-3-pro-image-preview": {
    input: 20.0,
    output: 120.0,
  },
  // https://ai.google.dev/gemini-api/docs/pricing
  "gemini-3.1-flash-image-preview": {
    input: 0.25,
    output: 60.0,
  },
  // https://platform.openai.com/docs/pricing
  "gpt-image-1.5": {
    input: 8.0,
    output: 32.0,
  },
  // https://developers.openai.com/api/docs/pricing
  "gpt-image-2": {
    input: 8.0,
    output: 30.0,
  },
};

// Pricing for legacy/deprecated models that are no longer in BaseModelIdType.
// These are kept to ensure we can still compute token usage for historical runs.
const LEGACY_MODEL_PRICING: Record<string, PricingEntry> = {
  "gpt-4-32k": {
    input: 60.0,
    output: 120.0,
  },
  "gpt-4": {
    input: 30.0,
    output: 60.0,
  },
  "gpt-4-turbo-2024-04-09": {
    input: 10.0,
    output: 30.0,
  },
  "gpt-4-0125-preview": {
    input: 10.0,
    output: 30.0,
  },
  "gpt-4-1106-preview": {
    input: 10.0,
    output: 30.0,
  },
  "gpt-4-vision-preview": {
    input: 10.0,
    output: 30.0,
  },
  "gpt-3.5-turbo-16k-0613": {
    input: 3.0,
    output: 4.0,
  },
  "gpt-3.5-turbo-0301": {
    input: 1.5,
    output: 2.0,
  },
  "gpt-3.5-turbo-0125": {
    input: 0.5,
    output: 1.5,
  },
  "gpt-3.5-turbo-16k": {
    input: 1.5,
    output: 2.0,
  },
  "gpt-3.5-turbo-instruct": {
    input: 1.5,
    output: 2.0,
  },
  "gpt-3.5-turbo-0613": {
    input: 1.5,
    output: 2.0,
  },
  "gpt-4o-mini-2024-07-18": {
    input: 0.15,
    output: 0.6,
  },
  "gpt-4o-2024-11-20": {
    input: 2.5,
    output: 10.0,
  },
  "gpt-4o-2024-05-13": {
    input: 5.0,
    output: 15.0,
  },
  "o1-preview": {
    input: 15.0,
    output: 60.0,
  },
  "o1-preview-2024-09-12": {
    input: 15.0,
    output: 60.0,
  },
  "o1-mini-2024-09-12": {
    input: 3.0,
    output: 12.0,
  },
  "claude-3-sonnet-20240229": {
    input: 3.0,
    output: 15.0,
  },
  "claude-3-5-sonnet-latest": {
    input: 3.0,
    output: 15.0,
  },
  "claude-4-sonnet-latest": {
    input: 3.0,
    output: 15.0,
  },
  "claude-4-opus-latest": {
    input: 15.0,
    output: 75.0,
  },
  "mistral-embed": {
    input: 0.1,
    output: 0.1,
  },
  "babbage-002": {
    input: 0.4,
    output: 0.4,
  },
  "davinci-002": {
    input: 2.0,
    output: 2.0,
  },
  "gpt-3.5-turbo-1106": {
    input: 1.0,
    output: 2.0,
  },
  "open-mistral-7b": {
    input: 0.25,
    output: 0.25,
  },
  "open-mixtral-8x7b": {
    input: 0.7,
    output: 0.7,
  },
  "mistral-small-2402": {
    input: 0.9,
    output: 2.8,
  },
  "codestral-2405": {
    input: 0.9,
    output: 2.8,
  },
  "open-mixtral-8x22b": {
    input: 1.9,
    output: 5.6,
  },
  "mistral-medium-2312": {
    input: 2.5,
    output: 7.5,
  },
  "mistral-large-2402": {
    input: 3.8,
    output: 11.3,
  },
  "mistral-large-2407": {
    input: 3.0,
    output: 9.0,
  },
  "o1-2024-12-17": {
    input: 15.0,
    output: 60.0,
  },
};

// Combined pricing record for all models (current + legacy + image).
export const MODEL_PRICING: Record<string, PricingEntry> = {
  ...CURRENT_MODEL_PRICING,
  ...IMAGE_MODEL_PRICING,
  ...LEGACY_MODEL_PRICING,
};
