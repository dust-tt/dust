import {
  mistralNonGreedyTemperatureSchema,
  mistralTemperatureSchema,
} from "@app/lib/model_constructors/providers/mistral/temperature";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { MISTRAL_LARGE_4 } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// Read off `GET /v1/models` (`max_context_length: 524288`) and confirmed live on
// 2026-10-06: a 560k-token prompt fails with "Prompt 560016 > 524288 maximum
// context length". https://docs.mistral.ai/models/mistral-large-4 advertises 1M,
// which the public preview does not serve yet.
const CONTEXT_SIZE = 524_288;
// Capability metadata only (not sent to the API — Mistral uses its own
// default). Mistral publishes no separate output cap, so the ceiling is the
// context window; the Dust layer applies the 2048 product value.
const MAX_OUTPUT_TOKENS = CONTEXT_SIZE;
// Omitting `reasoning_effort` returns no thinking block (verified live 2026-10-06).
const DEFAULT_REASONING_EFFORT = "none";

// Characterized against the live API (2026-10-06), on both the global and EU
// hosts: `reasoning_effort` accepts exactly none/high; every other value is
// rejected as unsupported. `temperature: 0` with reasoning on selects greedy
// sampling, which requires `top_p: 1` (we do not send it), so it is excluded
// there; reasoning-off takes the full 0..1.5 range.
const configSchema = z.union([
  inputConfigSchema.extend({
    reasoning: z.object({ effort: z.literal("high") }),
    temperature: mistralNonGreedyTemperatureSchema.optional(),
  }),
  inputConfigSchema.extend({
    reasoning: z
      .object({ effort: z.literal("none") })
      .default({ effort: DEFAULT_REASONING_EFFORT }),
    temperature: mistralTemperatureSchema.optional(),
  }),
]);

// Mixin carrying shared config; runtime base differs per surface.
export function WithMistralLarge4Config<
  TBase extends abstract new (...args: any[]) => object,
>(Base: TBase) {
  abstract class MistralLarge4 extends Base {
    static readonly model = MISTRAL_LARGE_4;

    static readonly configSchema = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return MistralLarge4;
}
