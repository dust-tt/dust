import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { FIREWORKS_KIMI_K2P5_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";
import { z } from "zod";

const CONTEXT_SIZE = 262_100;
const MAX_OUTPUT_TOKENS = 2_048;
const DEFAULT_REASONING_EFFORT = "medium";

// Mirrors the legacy Fireworks reasoning mapping: none/light drop
// reasoning_effort (default chain-of-thought), only medium/high reach the model.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["none", "low", "medium", "high"]) })
    .optional()
    .default({ effort: DEFAULT_REASONING_EFFORT }),
});

export function WithFireworksKimiK2Dot5Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class FireworksKimiK2Dot5 extends Base {
    static readonly modelId = FIREWORKS_KIMI_K2P5_MODEL_ID;

    static readonly configSchema = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return FireworksKimiK2Dot5;
}
