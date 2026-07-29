import {
  mistralNonGreedyTemperatureSchema,
  mistralTemperatureSchema,
} from "@app/lib/model_constructors/providers/mistral/temperature";
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

// Characterized against the live API (2026-07-27). Medium 3.5 accepts exactly
// `reasoning_effort` none/high; medium/low/minimal/xhigh are named as
// unsupported and `maximal` has no Mistral equivalent.
//
// `temperature` is a real knob in 0..1.5 — the previous `z.undefined()` was too
// narrow. The one exception is `temperature: 0` with reasoning on: that selects
// greedy sampling, which requires `top_p: 1`, and we do not send `top_p`, so
// the API answers "top_p must be 1 when using greedy sampling". Hence the
// union: reasoning-on excludes 0, reasoning-off takes the full range.
const configSchema = z.union([
  inputConfigSchema.extend({
    reasoning: z.object({ effort: z.literal("high") }),
    cacheKey: z.undefined(),
    temperature: mistralNonGreedyTemperatureSchema.optional(),
  }),
  inputConfigSchema.extend({
    // The default lives here: an absent `reasoning` means effort "none".
    reasoning: z
      .object({ effort: z.literal("none") })
      .default({ effort: DEFAULT_REASONING_EFFORT }),
    cacheKey: z.undefined(),
    temperature: mistralTemperatureSchema.optional(),
  }),
]);

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
