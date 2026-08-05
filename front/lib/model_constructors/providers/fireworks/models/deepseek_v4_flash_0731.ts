import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { DEEPSEEK_V4_FLASH_0731 } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

// Verified 2026-08-01: https://fireworks.ai/models/deepseek-ai/deepseek-v4-flash-0731
// (1040k context) and https://api-docs.deepseek.com/quick_start/pricing (384k output).
const CONTEXT_SIZE = 1_040_000;
const MAX_OUTPUT_TOKENS = 384_000;
const DEFAULT_REASONING_EFFORT = "high";

// DeepSeek documents low/high/max + disabled, default `high`:
// https://api-docs.deepseek.com/guides/thinking_mode/
// Fireworks also accepts medium/xhigh for any model it serves; excluding them is
// policy (follow the model author), not a provider constraint.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["none", "low", "high", "maximal"]) })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
});

export function WithDeepSeekDeepSeekV4Flash0731Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DeepSeekDeepSeekV4Flash0731 extends Base {
    static readonly model = DEEPSEEK_V4_FLASH_0731;

    static readonly configSchema = configSchema;

    // `number`, not the literal, so the Dust layer can cap them.
    static readonly contextSize: number = CONTEXT_SIZE;
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return DeepSeekDeepSeekV4Flash0731;
}
