import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { KIMI_K2P5 } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

const CONTEXT_SIZE = 262_100;
const MAX_OUTPUT_TOKENS = 2_048;
const DEFAULT_REASONING_EFFORT = "medium";

// Kimi K2.5 supports none/low/medium/high reasoning and defaults to medium.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["none", "low", "medium", "high"]) })
    .optional()
    .default({ effort: DEFAULT_REASONING_EFFORT }),
});

export function WithMoonshotAiKimiK2Dot5Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class MoonshotAiKimiK2Dot5 extends Base {
    static readonly model = KIMI_K2P5;

    static readonly configSchema = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return MoonshotAiKimiK2Dot5;
}
