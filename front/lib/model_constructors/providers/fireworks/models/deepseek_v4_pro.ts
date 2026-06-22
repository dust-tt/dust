import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { FIREWORKS_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/fireworks/reasoning_efforts";
import { FIREWORKS_DEEPSEEK_V4_PRO_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";
import { z } from "zod";

const CONTEXT_SIZE = 1_000_000;
const MAX_OUTPUT_TOKENS = 64_000;

// Mirrors the legacy Fireworks reasoning mapping: none/light drop
// reasoning_effort (default chain-of-thought), only medium/high reach the model.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(FIREWORKS_SUPPORTED_REASONING_EFFORTS) })
    .optional()
    .transform((r) =>
      r && (r.effort === "medium" || r.effort === "high") ? r : undefined
    ),
});

export function WithFireworksDeepSeekV4ProConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class FireworksDeepSeekV4Pro extends Base {
    static readonly modelId = FIREWORKS_DEEPSEEK_V4_PRO_MODEL_ID;

    static readonly configSchema = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return FireworksDeepSeekV4Pro;
}
