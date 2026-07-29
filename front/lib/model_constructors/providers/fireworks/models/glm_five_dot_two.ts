import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { GLM_5P2 } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

const CONTEXT_SIZE = 1_000_000;
const MAX_OUTPUT_TOKENS = 64_000;

// Z.ai documents three states for GLM-5.2: thinking disabled
// (`thinking: {type: "disabled"}`, enabled being the default), effort `high`,
// and effort `max` — which is the documented default and what its own examples
// use: https://docs.z.ai/guides/llm/glm-5.2
// Our `maximal` is Z.ai's `max`.
//
// Confirmed live through Fireworks on 2026-07-27 with the widest
// `inputConfigSchema`: `none` returns no reasoning content at all, high and max
// both reason. The Fireworks gateway is looser than the model — it also takes
// low/medium/xhigh and rejects only `minimal` — but those are not GLM-5.2
// efforts, so the schema does not expose them.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["none", "high", "maximal"]) })
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
