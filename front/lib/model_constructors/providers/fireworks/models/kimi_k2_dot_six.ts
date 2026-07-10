import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { FIREWORKS_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/fireworks/reasoning_efforts";
import { FIREWORKS_KIMI_K2P6_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";
import { z } from "zod";

const CONTEXT_SIZE = 262_000;
const MAX_OUTPUT_TOKENS = 2_048;

// Mirrors the legacy Fireworks reasoning mapping: none/low drop
// reasoning_effort (default chain-of-thought), only medium/high reach the model.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(FIREWORKS_SUPPORTED_REASONING_EFFORTS) })
    .optional()
    .transform((r) =>
      r && (r.effort === "medium" || r.effort === "high") ? r : undefined
    ),
});

export function WithFireworksKimiK2Dot6Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class FireworksKimiK2Dot6 extends Base {
    static readonly modelId = FIREWORKS_KIMI_K2P6_MODEL_ID;

    static readonly configSchema = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return FireworksKimiK2Dot6;
}
