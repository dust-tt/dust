import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { MISTRAL_LARGE_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

// Verified against https://docs.mistral.ai/getting-started/models/models_overview
// (2026-06-18): Mistral Large (mistral-large-3) has a 256k-token context window.
const CONTEXT_SIZE = 256_000;
// Capability metadata only — the request does not send an explicit max (the
// legacy client doesn't either), so Mistral uses its own default.
const MAX_OUTPUT_TOKENS = 2_048;

// Mistral Large is a non-reasoning model: the API rejects `reasoning_effort`.
// We accept `none` but drop it, so the converter omits `reasoning_effort`
// entirely. Temperature passes through unchanged.
const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({ effort: z.literal("none") })
    .optional()
    .transform(() => undefined),
  // Mistral has no explicit prompt-cache key.
  cacheKey: z.undefined(),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithMistralLargeConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class MistralLarge extends Base {
    static readonly modelId = MISTRAL_LARGE_MODEL_ID;

    static readonly configSchema = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return MistralLarge;
}
