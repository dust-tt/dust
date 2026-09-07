import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { DEEPSEEK_V4_PRO_0813 } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

// Verified 2026-09-07: https://fireworks.ai/models/deepseek-ai/deepseek-v4-pro-0813
// (1040k context) and https://api-docs.deepseek.com/quick_start/pricing (1M
// context, 384k maximum output). Fireworks' own examples cap a single response
// at 131,072 tokens, which is the limit that applies to this endpoint.
const CONTEXT_SIZE = 1_040_000;
const MAX_OUTPUT_TOKENS = 131_072;
const DEFAULT_REASONING_EFFORT = "high";

// DeepSeek documents low/high/max + disabled, default `high`, and states the
// effort mapping is "identical for `deepseek-v4-flash` and `deepseek-v4-pro`":
// https://api-docs.deepseek.com/guides/thinking_mode/
// Fireworks also accepts medium/xhigh for any model it serves, and DeepSeek
// silently folds them onto high; excluding them is policy (follow the model
// author) rather than a provider constraint.
//
// This differs from the `deepseek-v4-pro` preview endpoint, whose schema has no
// `low`: the preview predates the doc update that gave Pro the same three
// efforts as Flash.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["none", "low", "high", "maximal"]) })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
});

export function WithDeepSeekDeepSeekV4Pro0813Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DeepSeekDeepSeekV4Pro0813 extends Base {
    static readonly model = DEEPSEEK_V4_PRO_0813;

    static readonly configSchema = configSchema;

    // `number`, not the literal, so the Dust layer can cap them.
    static readonly contextSize: number = CONTEXT_SIZE;
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return DeepSeekDeepSeekV4Pro0813;
}
