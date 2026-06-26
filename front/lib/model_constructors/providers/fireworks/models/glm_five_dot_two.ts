import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { FIREWORKS_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/fireworks/reasoning_efforts";
import { FIREWORKS_GLM_5P2_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";
import { z } from "zod";

const CONTEXT_SIZE = 1_000_000;
const MAX_OUTPUT_TOKENS = 64_000;

// GLM-5.2 has no native light reasoning, so none/low must drop reasoning_effort
// (the legacy client does the same); only medium/high reach the model.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(FIREWORKS_SUPPORTED_REASONING_EFFORTS) })
    .optional()
    .transform((r) =>
      r && (r.effort === "medium" || r.effort === "high") ? r : undefined
    ),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithFireworksGlm52Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class FireworksGlm52 extends Base {
    static readonly modelId = FIREWORKS_GLM_5P2_MODEL_ID;

    static readonly configSchema = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return FireworksGlm52;
}
