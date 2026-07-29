import { MISTRAL_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/mistral/reasoning_efforts";
import { mistralTemperatureSchema } from "@app/lib/model_constructors/providers/mistral/temperature";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { MISTRAL_SMALL } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

// Verified against https://docs.mistral.ai/getting-started/models/models_overview
// (2026-06-18): Mistral Small has a 128k-token context window.
const CONTEXT_SIZE = 128_000;
// Capability metadata only (not sent to the API — Mistral uses its own
// default). Mistral publishes no separate output cap, so the ceiling is the
// context window; the Dust layer applies the 2048 product value.
const MAX_OUTPUT_TOKENS = CONTEXT_SIZE;

const DEFAULT_REASONING_EFFORT = "none";

// Small is a *reasoning* model, unlike Large and Codestral: the API accepts
// `reasoning_effort` none/high and names them in the rejection for every other
// value ("reasoning_effort='medium' is not supported for this model. Must be
// one of (none, high)"). It was previously wired to the non-reasoning schema,
// which rejected the `none` the Dust layer sends.
//
// Unlike Medium 3.5 it accepts `temperature: 0` at every effort, so the full
// 0..1.5 range applies here.
const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum([...MISTRAL_SUPPORTED_REASONING_EFFORTS]),
    })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
  cacheKey: z.undefined(),
  temperature: mistralTemperatureSchema.optional(),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithMistralSmallConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class MistralSmall extends Base {
    static readonly model = MISTRAL_SMALL;

    static readonly configSchema = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return MistralSmall;
}
