import {
  type InputConfig,
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { GPT_5_6_SOL_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

// https://developers.openai.com/api/docs/models/gpt-5.6-sol
const CONTEXT_SIZE = 272_000;
const MAX_OUTPUT_TOKENS = 64_000;
const DEFAULT_REASONING_EFFORT = "medium";

// gpt-5.6 accepts none/low/medium/high/xhigh/max. Our universal "maximal" maps
// to OpenAI's native "max" in the converter; "minimal" is unsupported and
// surfaces as an input configuration error.
const GPT_5_6_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "maximal",
] as const;

const configSchema = z.union([
  inputConfigSchema.extend({
    reasoning: z
      .object({ effort: z.enum(GPT_5_6_REASONING_EFFORTS) })
      .default({ effort: DEFAULT_REASONING_EFFORT }),
    // The Responses API rejects an explicit temperature while reasoning is on.
    temperature: z.undefined(),
  }),
  inputConfigSchema.extend({
    reasoning: z.object({ effort: z.literal("none") }),
    temperature: temperatureSchema.optional(),
  }),
]);

// Mixin carrying shared config; runtime base differs per surface.
export function WithOpenAIGptFiveDotSixSolConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class OpenAIGptFiveDotSixSol extends Base {
    static readonly modelId = GPT_5_6_SOL_MODEL_ID;

    static readonly configSchema: z.ZodType<InputConfig> = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return OpenAIGptFiveDotSixSol;
}
