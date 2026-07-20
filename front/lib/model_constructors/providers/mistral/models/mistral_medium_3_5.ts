import { MISTRAL_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/mistral/reasoning_efforts";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { MISTRAL_MEDIUM_3_5 } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// Verified against https://docs.mistral.ai/getting-started/models/models_overview
// (2026-06-18): Mistral Medium 3.5 has a 256k-token context window.
const CONTEXT_SIZE = 256_000;
// Capability metadata only (not sent to the API — Mistral uses its own
// default). Mistral publishes no separate output cap, so the ceiling is the
// context window; the Dust layer applies the 2048 product value.
const MAX_OUTPUT_TOKENS = CONTEXT_SIZE;
const DEFAULT_REASONING_EFFORT = "none";

// Mistral Medium 3.5 is a reasoning model: it accepts `none` (off) and `high`
// (on), sent as `reasoning_effort`. Temperature is dropped — Mistral rejects
// greedy sampling (temperature 0) alongside reasoning, and the legacy client
// also strips it for reasoning models.
const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum([...MISTRAL_SUPPORTED_REASONING_EFFORTS]),
    })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
  temperature: z.undefined(),
  // Mistral has no explicit prompt-cache key.
  cacheKey: z.undefined(),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithMistralMedium35Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class MistralMedium35 extends Base {
    static readonly model = MISTRAL_MEDIUM_3_5;

    static readonly configSchema = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return MistralMedium35;
}
