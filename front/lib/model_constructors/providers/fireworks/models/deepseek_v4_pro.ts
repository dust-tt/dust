import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { DEEPSEEK_V4_PRO } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

// Verified through Fireworks' Get Model API on 2026-08-19:
// https://docs.fireworks.ai/api-reference/get-model
// `contextLength` is exactly 1,048,576. DeepSeek documents a 384k maximum
// output: https://api-docs.deepseek.com/quick_start/pricing
const CONTEXT_SIZE = 1_048_576;
const MAX_OUTPUT_TOKENS = 384_000;

// DeepSeek documents exactly three states: thinking disabled
// (`thinking: {type: "disabled"}`), effort `high` (the default) and effort
// `max`: https://api-docs.deepseek.com/guides/thinking_mode/
// It also accepts low/medium/xhigh purely for compatibility — "low and medium
// are mapped to high, and xhigh is mapped to max" — so exposing them would
// silently rewrite the caller's choice. We expose the three real states only;
// our `maximal` is DeepSeek's `max`.
//
// Confirmed live through Fireworks on 2026-08-19 with the widest
// `inputConfigSchema`: `none` returns no reasoning content at all, high and max
// both reason, and the gateway rejects only `minimal`.
//
// The legacy router only ever ran this model at `high` (its one configurable
// effort was `none`, which omitted `reasoning_effort` and let Fireworks fall
// back to `high`). That coercion is a Dust product choice, so it lives in the
// llms layer as the `forceHighReasoningEffort` config parser rather than as a
// schema transform.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["none", "high", "maximal"]) })
    .default({ effort: "high" }),
});

export function WithDeepSeekDeepSeekV4ProConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DeepSeekDeepSeekV4Pro extends Base {
    static readonly model = DEEPSEEK_V4_PRO;

    static readonly configSchema = configSchema;

    // `number`, not the literal, so the Dust layer can cap them.
    static readonly contextSize: number = CONTEXT_SIZE;
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return DeepSeekDeepSeekV4Pro;
}
