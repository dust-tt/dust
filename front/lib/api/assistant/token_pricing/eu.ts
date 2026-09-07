import type { PricingEntry } from "@app/lib/api/assistant/token_pricing/global";
import { MODEL_PRICING } from "@app/lib/api/assistant/token_pricing/global";
import {
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  CLAUDE_4_5_OPUS_20251101_MODEL_ID,
  CLAUDE_4_5_SONNET_20250929_MODEL_ID,
  CLAUDE_OPUS_4_6_MODEL_ID,
  CLAUDE_OPUS_4_7_MODEL_ID,
  CLAUDE_OPUS_4_8_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
  CLAUDE_SONNET_5_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
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
  GPT_6_ASTRA_MODEL_ID,
} from "@app/types/assistant/models/openai";

// Regional and multi-region endpoints charge a 10% premium over global endpoints.
// Anthropic: Claude 4.5 and later models served through Vertex AI in EU.
// OpenAI: models whose pricing pages specify the data-residency uplift.
// Verified 2026-08-13:
// https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai
// https://openai.com/api/pricing/
const EU_PRICING_MULTIPLIER = 1.1;

export const EU_UPLIFT_MODEL_IDS = [
  CLAUDE_4_5_SONNET_20250929_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
  CLAUDE_SONNET_5_MODEL_ID,
  CLAUDE_4_5_OPUS_20251101_MODEL_ID,
  CLAUDE_OPUS_4_6_MODEL_ID,
  CLAUDE_OPUS_4_7_MODEL_ID,
  CLAUDE_OPUS_4_8_MODEL_ID,
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  GPT_5_4_MODEL_ID,
  GPT_5_4_MINI_MODEL_ID,
  GPT_5_4_NANO_MODEL_ID,
  GPT_5_5_MODEL_ID,
  GPT_5_6_SOL_MODEL_ID,
  GPT_6_ASTRA_MODEL_ID,
  GPT_5_6_TERRA_MODEL_ID,
  GPT_5_6_TERRA_LONG_CONTEXT_MODEL_ID,
  GPT_5_6_LUNA_MODEL_ID,
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

export const EU_MODEL_PRICING: Partial<Record<string, PricingEntry>> =
  Object.fromEntries(
    EU_UPLIFT_MODEL_IDS.map((modelId) => [
      modelId,
      applyRegionalUplift(MODEL_PRICING[modelId]),
    ])
  );
