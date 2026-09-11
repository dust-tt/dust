import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { GLM_5P3 } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

// Verified 2026-09-11 against Z.ai's model guide and the Fireworks model page:
// https://docs.z.ai/guides/llm/glm-5.3
// https://fireworks.ai/models/fireworks/glm-5p3
const CONTEXT_SIZE = 1_048_576;
const MAX_OUTPUT_TOKENS = 131_072;
const DEFAULT_REASONING_EFFORT = "maximal";

// Z.ai documents always-on thinking (`thinking.type` only takes `"enabled"`)
// with exactly low/high/max efforts and `max` as the default:
// https://docs.z.ai/guides/llm/glm-5.3
// Our `maximal` is Z.ai's `max`.
//
// Confirmed live through Fireworks on 2026-09-11 with the widest
// `inputConfigSchema`: `none` is rejected outright ("GLM-5.3 is a thinking-only
// model"), `minimal` is not a Fireworks effort at all, and low/high/max all
// complete. The gateway also accepts the undocumented medium/xhigh, but those
// are not GLM-5.3 efforts, so the schema follows the model author's documented
// set. Temperature 0, 0.1, and 1 all succeed. Unlike GLM-5.3 Flash, a forced
// named tool emits the requested call and terminates correctly, so named
// forcing is exposed.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["low", "high", "maximal"]) })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithZAiGlm53Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class ZAiGlm53 extends Base {
    static readonly model = GLM_5P3;

    static readonly configSchema = configSchema;

    // Typed as `number` so the Dust layer can apply product caps.
    static readonly contextSize: number = CONTEXT_SIZE;
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return ZAiGlm53;
}
