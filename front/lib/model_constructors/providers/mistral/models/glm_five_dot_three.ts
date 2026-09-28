import { mistralConfigSchema } from "@app/lib/model_constructors/providers/mistral/inputConfig";
import { GLM_5P3 } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

// https://docs.mistral.ai/models/zai-glm-5-3 (2026-09-28).
const CONTEXT_SIZE = 1_048_576;
const MAX_OUTPUT_TOKENS = 131_072;
// Z.ai's documented default, and what Mistral applies when the field is absent
// (same thinking length as `max`, measured 2026-09-28).
// https://docs.z.ai/guides/llm/glm-5.3
const DEFAULT_REASONING_EFFORT = "maximal";

// GLM-5.3 as hosted by Mistral, separate from the Fireworks mixin since each
// host has its own request shape. Characterized against the live EU API
// (2026-09-28) with the widest `mistralConfigSchema`:
//
//   - `reasoning_effort` takes exactly low/high/max, matching Z.ai's docs; any
//     other value is a 400 naming those three. Thinking cannot be disabled.
//   - `temperature` is accepted in 0..1.5 at every effort, like Mistral's own
//     models.
//   - A forced tool call and a JSON-schema response format both work.
const configSchema = mistralConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["low", "high", "maximal"]) })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
});

export function WithZAiGlm53MistralConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class ZAiGlm53Mistral extends Base {
    static readonly model = GLM_5P3;

    static readonly configSchema = configSchema;

    // Typed as `number` so the Dust layer can apply product caps.
    static readonly contextSize: number = CONTEXT_SIZE;
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return ZAiGlm53Mistral;
}
