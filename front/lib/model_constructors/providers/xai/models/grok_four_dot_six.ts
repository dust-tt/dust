import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { GROK_4_6 } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

// Native model spec verified 2026-08-12 against
// https://docs.x.ai/developers/models/grok-4.6 and
// https://docs.x.ai/developers/release-notes. Grok 4.6 has a 500k context
// window and no separate text output limit, so the context window is the
// effective native output ceiling. Dust applies 256k/64k product caps in the
// llms layer.
const CONTEXT_SIZE = 500_000;
const MAX_OUTPUT_TOKENS = CONTEXT_SIZE;

// xAI documents low/medium/high/xhigh, with `high` as the default, and says
// reasoning cannot be disabled:
// https://docs.x.ai/developers/model-capabilities/text/reasoning (2026-08-12).
// The widest-schema live run on 2026-08-12 confirmed all four documented
// efforts, temperature values 0/0.1/1, forced tools, and structured output.
// The API also accepted undocumented `minimal`; we exclude it because xAI can
// change undocumented behavior without notice. `none` and `maximal` returned
// provider errors.
const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["low", "medium", "high", "xhigh"]) })
    .default({ effort: "high" }),
});

export function WithXaiGrokFourDotSixConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class XaiGrokFourDotSix extends Base {
    static readonly model = GROK_4_6;

    static readonly configSchema = configSchema;

    static readonly contextSize: number = CONTEXT_SIZE;
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return XaiGrokFourDotSix;
}
