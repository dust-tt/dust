import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { GLM_5P3_FLASH } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

// Verified 2026-08-31 against the live Fireworks model metadata and Z.ai's
// model guide: https://docs.z.ai/guides/vlm/glm-5.3-flash
const CONTEXT_SIZE = 1_048_576;
const MAX_OUTPUT_TOKENS = 131_072;
const DEFAULT_REASONING_EFFORT = "maximal";

// Z.ai documents always-on thinking with exactly low/high/max efforts and max
// as the default. It also documents only automatic tool choice:
// https://docs.z.ai/guides/vlm/glm-5.3-flash
// https://docs.z.ai/guides/overview/concept-param
// Our `maximal` maps to Z.ai's `max`.
//
// Confirmed live through Fireworks on 2026-08-31: omitting an effort defaults
// to reasoning, low/high/max all reason, and `none` is rejected because this
// deployment cannot disable reasoning. The gateway also accepts the
// undocumented medium/xhigh values, but those are not GLM-5.3-Flash efforts,
// so the schema follows the model author's documented set. Temperature values
// 0, 0.1, and 1 all succeed. Automatic and disabled (`none`) tool choice both
// complete normally. A forced named tool emits the requested call but
// incorrectly finishes with `stop` instead of `tool_calls`, so named forcing
// is not exposed.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["low", "high", "maximal"]) })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
  forceTool: z.undefined(),
});

export function WithZAiGlm53FlashConfig<
  TBase extends abstract new (...args: any[]) => object,
>(Base: TBase) {
  abstract class ZAiGlm53Flash extends Base {
    static readonly model = GLM_5P3_FLASH;

    static readonly configSchema = configSchema;

    // Typed as `number` so the Dust layer can apply product caps.
    static readonly contextSize: number = CONTEXT_SIZE;
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return ZAiGlm53Flash;
}
