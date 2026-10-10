import type { PricingEntry } from "@app/lib/api/assistant/token_pricing/global";
import { MODEL_PRICING } from "@app/lib/api/assistant/token_pricing/global";
import {
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  CLAUDE_4_5_OPUS_20251101_MODEL_ID,
  CLAUDE_4_5_SONNET_20250929_MODEL_ID,
  CLAUDE_HAIKU_5_5_MODEL_ID,
  CLAUDE_OPUS_4_6_MODEL_ID,
  CLAUDE_OPUS_4_7_MODEL_ID,
  CLAUDE_OPUS_4_8_MODEL_ID,
  CLAUDE_OPUS_5_5_MODEL_ID,
  CLAUDE_OPUS_5_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
  CLAUDE_SONNET_5_5_MODEL_ID,
  CLAUDE_SONNET_5_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import {
  FIREWORKS_GLM_5P3_MODEL_ID,
  FIREWORKS_KIMI_K3_MODEL_ID,
} from "@app/types/assistant/models/fireworks";
import {
  GEMINI_3_6_FLASH_MODEL_ID,
  GEMINI_3_7_FLASH_MODEL_ID,
  GEMINI_3_8_FLASH_MODEL_ID,
} from "@app/types/assistant/models/google_ai_studio";
import {
  MISTRAL_CODESTRAL_MODEL_ID,
  MISTRAL_LARGE_4_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
  MISTRAL_MEDIUM_3_5_MODEL_ID,
  MISTRAL_SMALL_MODEL_ID,
} from "@app/types/assistant/models/mistral";
import type { StaticModelIdType } from "@app/types/assistant/models/models";
import {
  GPT_5_4_MINI_MODEL_ID,
  GPT_5_4_MODEL_ID,
  GPT_5_4_NANO_MODEL_ID,
  GPT_5_5_MODEL_ID,
  GPT_5_6_LUNA_MODEL_ID,
  GPT_5_6_SOL_MODEL_ID,
  GPT_5_6_TERRA_LONG_CONTEXT_MODEL_ID,
  GPT_5_6_TERRA_MODEL_ID,
  GPT_6_1_SOL_MODEL_ID,
  GPT_6_ASTRA_MODEL_ID,
  GPT_6_LUNA_MODEL_ID,
  GPT_6_SOL_MODEL_ID,
} from "@app/types/assistant/models/openai";

// Regional and multi-region endpoints charge a 10% premium over global endpoints.
// Anthropic: Claude 4.5 and later models served through Vertex AI in EU.
// OpenAI: models whose pricing pages specify the data-residency uplift.
// Google: Gemini served through a non-global agent-platform endpoint.
// Mistral: every model served through `api.eu.mistral.ai`.
// Verified 2026-09-22:
// https://docs.mistral.ai/inference/regional-inference
// Verified 2026-08-13:
// https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai
// https://openai.com/api/pricing/
// Verified 2026-09-04:
// https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing
//
// This list is not completeness-enforced: a registered EU endpoint missing from it silently
// bills at global rates. It must cover every `region = EUROPE` endpoint in `STREAM_ENDPOINTS`
// whose `tokenPricing` sits above its global sibling's.
const EU_PRICING_MULTIPLIER = 1.1;

export const EU_UPLIFT_MODEL_IDS = [
  CLAUDE_4_5_SONNET_20250929_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
  CLAUDE_SONNET_5_5_MODEL_ID,
  CLAUDE_SONNET_5_MODEL_ID,
  CLAUDE_4_5_OPUS_20251101_MODEL_ID,
  CLAUDE_OPUS_4_6_MODEL_ID,
  CLAUDE_OPUS_4_7_MODEL_ID,
  CLAUDE_OPUS_4_8_MODEL_ID,
  CLAUDE_OPUS_5_MODEL_ID,
  CLAUDE_OPUS_5_5_MODEL_ID,
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  CLAUDE_HAIKU_5_5_MODEL_ID,
  GPT_5_4_MODEL_ID,
  GPT_5_4_MINI_MODEL_ID,
  GPT_5_4_NANO_MODEL_ID,
  GPT_5_5_MODEL_ID,
  GPT_5_6_SOL_MODEL_ID,
  GPT_6_SOL_MODEL_ID,
  GPT_6_1_SOL_MODEL_ID,
  GPT_6_ASTRA_MODEL_ID,
  GPT_5_6_TERRA_MODEL_ID,
  GPT_5_6_TERRA_LONG_CONTEXT_MODEL_ID,
  GPT_5_6_LUNA_MODEL_ID,
  GPT_6_LUNA_MODEL_ID,
  GEMINI_3_6_FLASH_MODEL_ID,
  GEMINI_3_7_FLASH_MODEL_ID,
  GEMINI_3_8_FLASH_MODEL_ID,
  MISTRAL_CODESTRAL_MODEL_ID,
  MISTRAL_LARGE_4_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
  MISTRAL_MEDIUM_3_5_MODEL_ID,
  MISTRAL_SMALL_MODEL_ID,
] as const satisfies readonly StaticModelIdType[];

function applyRegionalUplift(pricing: PricingEntry): PricingEntry {
  return {
    input: pricing.input * EU_PRICING_MULTIPLIER,
    output: pricing.output * EU_PRICING_MULTIPLIER,
    ...(pricing.cache_creation_input_tokens !== undefined && {
      cache_creation_input_tokens:
        pricing.cache_creation_input_tokens * EU_PRICING_MULTIPLIER,
    }),
    ...(pricing.long_cache_creation_input_tokens !== undefined && {
      long_cache_creation_input_tokens:
        pricing.long_cache_creation_input_tokens * EU_PRICING_MULTIPLIER,
    }),
    ...(pricing.cache_read_input_tokens !== undefined && {
      cache_read_input_tokens:
        pricing.cache_read_input_tokens * EU_PRICING_MULTIPLIER,
    }),
    ...(pricing.long_context && {
      long_context: {
        prompt_token_threshold: pricing.long_context.prompt_token_threshold,
        input: pricing.long_context.input * EU_PRICING_MULTIPLIER,
        output: pricing.long_context.output * EU_PRICING_MULTIPLIER,
        ...(pricing.long_context.cache_creation_input_tokens !== undefined && {
          cache_creation_input_tokens:
            pricing.long_context.cache_creation_input_tokens *
            EU_PRICING_MULTIPLIER,
        }),
        ...(pricing.long_context.long_cache_creation_input_tokens !==
          undefined && {
          long_cache_creation_input_tokens:
            pricing.long_context.long_cache_creation_input_tokens *
            EU_PRICING_MULTIPLIER,
        }),
        ...(pricing.long_context.cache_read_input_tokens !== undefined && {
          cache_read_input_tokens:
            pricing.long_context.cache_read_input_tokens *
            EU_PRICING_MULTIPLIER,
        }),
      },
    }),
  };
}

// EU endpoints on a different host than their global sibling, so their price
// is not a flat uplift of it. GLM-5.3: Fireworks globally, Mistral in the EU
// (1.1x Mistral list, https://docs.mistral.ai/models/zai-glm-5-3, 2026-09-28).
// Regional inference pricing reference: https://docs.mistral.ai/inference/regional-inference.
// Kimi K3: Fireworks globally, Blackfuel in the EU (`GET /v1/models` pricing for
// `moonshotai/Kimi-K3:eu`, 2026-10-05).
const EU_HOST_MODEL_PRICING = {
  [FIREWORKS_GLM_5P3_MODEL_ID]: {
    input: 1.54,
    output: 4.84,
    cache_read_input_tokens: 0.154,
  },
  [FIREWORKS_KIMI_K3_MODEL_ID]: {
    input: 3,
    output: 15,
    cache_read_input_tokens: 0.6,
  },
} satisfies Partial<Record<StaticModelIdType, PricingEntry>>;

export const EU_MODEL_PRICING: Partial<Record<string, PricingEntry>> = {
  ...Object.fromEntries(
    EU_UPLIFT_MODEL_IDS.map((modelId) => [
      modelId,
      applyRegionalUplift(MODEL_PRICING[modelId]),
    ])
  ),
  ...EU_HOST_MODEL_PRICING,
};
