import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { DEEPSEEK_V4_PRO } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

const CONTEXT_SIZE = 1_000_000;
const MAX_OUTPUT_TOKENS = 64_000;

// DeepSeek V4 Pro only supports none/high/maximal reasoning; `none` drops
// reasoning_effort, high/maximal reach the model. Defaults to high.
const configSchema = fireworksConfigSchema.extend({
  // TODO(new-llm-router): force reasoning effort to `high` regardless of input.
  // In the legacy model the only configurable effort is `none`, and when set we
  // omit reasoning_effort from the payload, which makes Fireworks fall back to
  // its `high` default. So legacy DeepSeek V4 Pro effectively always runs `high`.
  // We force `high` here to match that behavior. Once the router supports all
  // reasoning efforts, migrate the legacy `none` values to `high` and remove this.
  reasoning: z
    .object({ effort: z.enum(["none", "high", "maximal"]) })
    .optional()
    .transform(() => ({ effort: "high" as const })),
});

export function WithDeepSeekDeepSeekV4ProConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DeepSeekDeepSeekV4Pro extends Base {
    static readonly model = DEEPSEEK_V4_PRO;

    static readonly configSchema = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return DeepSeekDeepSeekV4Pro;
}
