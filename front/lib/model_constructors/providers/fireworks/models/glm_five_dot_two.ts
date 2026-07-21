import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { GLM_5P2 } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

const CONTEXT_SIZE = 1_000_000;
const MAX_OUTPUT_TOKENS = 64_000;

// GLM-5.2 only supports none/high/maximal reasoning; `none` drops
// reasoning_effort, high/maximal reach the model. Defaults to maximal.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["none", "high", "maximal"]) })
    .optional()
    .default({ effort: "maximal" }),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithZAiGlm52Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class ZAiGlm52 extends Base {
    static readonly model = GLM_5P2;

    static readonly configSchema = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return ZAiGlm52;
}
