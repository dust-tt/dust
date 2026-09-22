import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { GROK_4_7 } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

// Native model spec verified 2026-09-22 against
// https://docs.x.ai/developers/models/grok-4.7 and
// https://docs.x.ai/developers/release-notes. Like Grok 4.6, Grok 4.7 has a
// 500k context window and no separate text output limit, so the context window
// is the effective native output ceiling. Dust applies 256k/64k product caps in
// the llms layer.
const CONTEXT_SIZE = 500_000;
const MAX_OUTPUT_TOKENS = CONTEXT_SIZE;

// xAI documents low/medium/high/xhigh, with `high` as the default, and says
// reasoning cannot be disabled:
// https://docs.x.ai/developers/model-capabilities/text/reasoning and
// https://docs.x.ai/developers/models/grok-4.7 (2026-09-22). The schema mirrors
// the documented set: `none`, `minimal` and `maximal` are not Grok 4.7 efforts.
const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["low", "medium", "high", "xhigh"]) })
    .default({ effort: "high" }),
});

export function WithXaiGrokFourDotSevenConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class XaiGrokFourDotSeven extends Base {
    static readonly model = GROK_4_7;

    static readonly configSchema = configSchema;

    static readonly contextSize: number = CONTEXT_SIZE;
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return XaiGrokFourDotSeven;
}
