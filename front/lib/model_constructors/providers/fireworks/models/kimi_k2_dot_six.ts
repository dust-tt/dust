import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { KIMI_K2P6 } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

const CONTEXT_SIZE = 262_000;
const MAX_OUTPUT_TOKENS = 2_048;
const DEFAULT_REASONING_EFFORT = "high";

// K2.6 thinking is binary — on or off, not graded. Moonshot documents it as a
// model with thinking and non-thinking modes, turned off with
// `thinking: {type: "disabled"}`:
// https://platform.kimi.ai/docs/guide/kimi-k2-6-quickstart
//
// Measured through Fireworks on 2026-07-27 (same prompt, reasoning_content
// length): none 0, low 1374, medium 1054, high 1701, max 2587, omitted 1759.
// The graded values do not order — `low` produces more than `medium` — which
// confirms only on/off is real and the spread is sampling noise.
//
// So the schema exposes exactly those two states. `high` is the label for "on"
// rather than `medium`: K2.6 reasons far more deeply than its siblings at any
// setting (K3 manages 250-820 characters on the same prompt), and the doc
// describes thinking mode as designed for deep multi-tool reasoning. Calling it
// `medium` would imply a deeper tier exists, which it does not.
//
// No converter override is needed: `reasoningToOpenAIResponsesReasoning`
// already maps `none` -> "none" (verified live: zero reasoning content) and
// `high` -> "high". The product still offers light/medium, so the llms layer
// folds them onto `high` with the `mapNonNoneReasoningToHigh` config parser.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["none", "high"]) })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
});

export function WithMoonshotAiKimiK2Dot6Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class MoonshotAiKimiK2Dot6 extends Base {
    static readonly model = KIMI_K2P6;

    static readonly configSchema = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return MoonshotAiKimiK2Dot6;
}
