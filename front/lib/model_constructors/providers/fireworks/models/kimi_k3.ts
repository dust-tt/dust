import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { KIMI_K3 } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

// https://fireworks.ai/models/fireworks/kimi-k3 (1040k context, verified
// 2026-07-27). Moonshot documents a 131k default / 1M max completion budget;
// we cap output at 64k like the other 1M-context Fireworks models.
const CONTEXT_SIZE = 1_040_000;
const MAX_OUTPUT_TOKENS = 64_000;
const DEFAULT_REASONING_EFFORT = "medium";

// Same Fireworks reasoning contract as Kimi K2.6: none/low drop
// reasoning_effort (default chain-of-thought), only medium/high reach the
// model.
// TODO(2026-07-27 henry): Moonshot's own platform documents K3 as low/high/max
// with thinking always on (https://platform.kimi.ai/docs/guide/kimi-k3-quickstart),
// while Fireworks documents low/medium/high across the models it serves
// (https://docs.fireworks.ai/guides/reasoning). We mirror the K2.6 contract
// here; the live endpoint test must confirm it before merge.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["none", "low", "medium", "high"]) })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
});

export function WithMoonshotAiKimiK3Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class MoonshotAiKimiK3 extends Base {
    static readonly model = KIMI_K3;

    static readonly configSchema = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return MoonshotAiKimiK3;
}
