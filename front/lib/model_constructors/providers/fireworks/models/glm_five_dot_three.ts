import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { GLM_5P3 } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

// Specs taken 2026-09-07 from Z.ai's model guide and the Fireworks model page:
// https://docs.z.ai/guides/llm/glm-5.3
// https://fireworks.ai/models/fireworks/glm-5p3
// Z.ai documents a 1M context window and 128K max output. Fireworks displays
// the window rounded to "1040k".
const CONTEXT_SIZE = 1_048_576;
const MAX_OUTPUT_TOKENS = 131_072;
const DEFAULT_REASONING_EFFORT = "maximal";

// Z.ai documents always-on thinking for GLM-5.3 with exactly low/high/max
// efforts and max as the default; thinking cannot be disabled:
// https://docs.z.ai/guides/llm/glm-5.3
// It documents only automatic tool choice for the GLM family:
// https://docs.z.ai/guides/overview/concept-param
// Our `maximal` maps to Z.ai's `max`.
//
// UNVERIFIED: these expectations are narrowed from the documented Z.ai contract
// and from the GLM-5.3-Flash endpoint characterized live on 2026-08-31. They
// have NOT been confirmed against the live Fireworks deployment for this model.
// The live suite must be run before merge; in particular the Fireworks gateway
// is known to accept undocumented effort values, and named tool forcing is
// withheld here on the strength of the Z.ai family documentation rather than an
// observed response.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["low", "high", "maximal"]) })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
  forceTool: z.undefined(),
});

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
