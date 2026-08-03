import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { KIMI_K3 } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

// Real model spec, verified 2026-07-27 against
// https://fireworks.ai/models/fireworks/kimi-k3 (1040k context) and
// https://platform.kimi.ai/docs/guide/kimi-k3-quickstart (max_completion_tokens
// defaults to 131k). The Dust product caps (256k context, 64k output) are
// applied in the llms layer.
const CONTEXT_SIZE = 1_040_000;
const MAX_OUTPUT_TOKENS = 131_072;
const DEFAULT_REASONING_EFFORT = "maximal";

// Moonshot documents exactly low/high/max for K3, with `max` as the model
// default: https://platform.kimi.ai/docs/guide/use-reasoning-effort
// Fireworks' own reasoning page is generic gateway guidance ("low", "medium" or
// "high") and says nothing specific about K3
// (https://docs.fireworks.ai/guides/reasoning), so it is not a contradiction —
// we follow the model author. Our `maximal` maps to Moonshot's `max`.
//
// Confirmed live through Fireworks' Responses API on 2026-07-28:
// low/high/max all reason. A 2026-07-27 broad gateway characterization also
// found that Fireworks accepts `medium`, `xhigh` and `none` (which does turn
// thinking off, despite K3 being described as "thinking permanently enabled"),
// and rejects only `minimal`. We expose the documented set only, since
// undocumented efforts can change without notice.
//
// The default is `max`, as Moonshot documents. Dust's legacy low/medium/high
// efforts are folded onto K3's low/high/max by the `mapReasoningEffortToLowHighMax`
// config parser in the llms layer.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["low", "high", "maximal"]) })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
});

export function WithMoonshotAiKimiK3Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class MoonshotAiKimiK3 extends Base {
    static readonly model = KIMI_K3;

    static readonly configSchema = configSchema;

    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly contextSize: number = CONTEXT_SIZE;
    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return MoonshotAiKimiK3;
}
