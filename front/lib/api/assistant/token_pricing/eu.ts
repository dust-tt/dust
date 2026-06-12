import type { PricingEntry } from "@app/lib/api/assistant/token_pricing/global";

// EU-hosted pricing overrides (models served via Google Vertex AI in EU).
// Vertex AI EU incurs a 10% surcharge over global provider pricing.
// Only models currently routable via Vertex in EU are listed here.
// https://cloud.google.com/vertex-ai/pricing

export const EU_MODEL_PRICING: Partial<Record<string, PricingEntry>> = {
  // Anthropic models via Vertex AI EU.
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
  // Google models via Vertex AI EU.
  "gemini-3.1-flash-lite": {
    input: 0.275,
    output: 1.65,
    cache_read_input_tokens: 0.0275,
  },
  "gemini-3.1-pro-preview": {
    input: 4.4,
    output: 19.8,
  },
  "gemini-3.5-flash": {
    input: 1.65,
    output: 9.9,
    cache_read_input_tokens: 0.165,
  },
};
