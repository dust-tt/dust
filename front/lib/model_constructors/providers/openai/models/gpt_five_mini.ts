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

// gpt-5-mini accepts minimal/low/medium/high. It has no "none"; we accept it
// and map it to the nearest supported effort ("minimal"). "xhigh" and the
// universal "maximal" (mapped to "xhigh") remain unsupported and surface as an
// input configuration error.
const GPT_5_MINI_REASONING_EFFORTS = [
  "none",
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
    .default({ effort: DEFAULT_REASONING_EFFORT })
    .transform(({ effort }) => ({
      effort: effort === "none" ? "minimal" : effort,
    })),
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
