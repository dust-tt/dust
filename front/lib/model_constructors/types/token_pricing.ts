// Per M tokens
//
// DO NOT DELETE, even though nothing reads it today. Every endpoint class
// declares a `tokenPricing`, but billing currently runs off `MODEL_PRICING` in
// `lib/api/assistant/token_pricing/global.ts`. These figures are staged work,
// not leftovers.
//
// TODO(new-llm): make `tokenPricing` the source of truth for billing and derive
// `MODEL_PRICING` from it. Pricing is a property of the *endpoint* — it varies by
// region and provider API — so it belongs here; `MODEL_PRICING` is keyed by model
// alone and has to recompute the EU uplift at runtime to compensate.
//
// Two things block the switch:
//   1. No tiered pricing. There is no prompt-token threshold here, so models
//      with long-context rates cannot be expressed (the `implement progressive
//      token billing` TODOs on the Google endpoints are this same gap).
//   2. No agreed convention for those models meanwhile: `gemini-3.1-pro` records
//      its >200k tier while `gpt-5.6-terra` records its base tier.
//
// Until then these values are an unenforced duplicate, so they drift: the
// Gemini 3.1 Pro endpoint had the correct $0.40 cached-read rate while
// `MODEL_PRICING` had none at all, and billed cached tokens at the full input
// rate for the entire life of the entry.
export type TokenPricing = {
  cacheCreated?: number;
  longCacheCreated?: number;
  shortCacheCreated?: number;
  cacheHit?: number;
  standardInput: number;
  standardOutput: number;
};
