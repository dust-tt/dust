import {
  type InputConfig,
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { GPT_5_MINI_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

// https://developers.openai.com/api/docs/models/gpt-5-mini
const CONTEXT_SIZE = 400_000;
const MAX_OUTPUT_TOKENS = 128_000;
const DEFAULT_REASONING_EFFORT = "medium";

// gpt-5-mini accepts minimal/low/medium/high. Unlike gpt-5.5 it rejects "none"
// and "xhigh"; the universal "maximal" (mapped to "xhigh") is also unsupported.
// All three surface as an input configuration error.
const GPT_5_MINI_REASONING_EFFORTS = [
  "minimal",
  "low",
  "medium",
  "high",
] as const;

// The Responses API rejects an explicit temperature for gpt-5-mini in every
// configuration, so it is always dropped.
const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(GPT_5_MINI_REASONING_EFFORTS) })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
  temperature: temperatureSchema.optional().transform(() => undefined),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithOpenAIGptFiveMiniConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class OpenAIGptFiveMini extends Base {
    static readonly modelId = GPT_5_MINI_MODEL_ID;

    static readonly configSchema: z.ZodType<InputConfig> = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return OpenAIGptFiveMini;
}
