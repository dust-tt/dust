import type { PricingEntry } from "@app/lib/api/assistant/token_pricing/global";

// EU-hosted pricing overrides for Anthropic models served via Google Vertex AI in EU.
// Anthropic charges a 10% surcharge on Vertex AI EU inference.
// Only models currently routable via Vertex in EU are listed here.
// https://www.anthropic.com/pricing

export const EU_MODEL_PRICING: Partial<Record<string, PricingEntry>> = {
  "claude-sonnet-4-5-20250929": {
    input: 3.3,
    output: 16.5,
    cache_creation_input_tokens: 4.125,
    cache_read_input_tokens: 0.33,
  },
  "claude-sonnet-4-6": {
    input: 3.3,
    output: 16.5,
    cache_creation_input_tokens: 4.125,
    cache_read_input_tokens: 0.33,
  },
  "claude-opus-4-5-20251101": {
    input: 5.5,
    output: 27.5,
    cache_creation_input_tokens: 6.875,
    cache_read_input_tokens: 0.55,
  },
  "claude-opus-4-6": {
    input: 5.5,
    output: 27.5,
    cache_creation_input_tokens: 6.875,
    cache_read_input_tokens: 0.55,
  },
  "claude-opus-4-7": {
    input: 5.5,
    output: 27.5,
    cache_creation_input_tokens: 6.875,
    cache_read_input_tokens: 0.55,
  },
  "claude-opus-4-8": {
    input: 5.5,
    output: 27.5,
    cache_creation_input_tokens: 6.875,
    cache_read_input_tokens: 0.55,
  },
  "claude-haiku-4-5-20251001": {
    input: 1.1,
    output: 5.5,
    cache_creation_input_tokens: 1.375,
    cache_read_input_tokens: 0.11,
  },
};
