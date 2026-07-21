import {
  type InputConfig,
  inputConfigSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { GPT_5_MINI } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// https://developers.openai.com/api/docs/models/gpt-5-mini
const CONTEXT_SIZE = 400_000;
const MAX_OUTPUT_TOKENS = 128_000;
const DEFAULT_REASONING_EFFORT = "medium";

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
  temperature: z.undefined(),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithOpenAIGptFiveMiniConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class OpenAIGptFiveMini extends Base {
    static readonly model = GPT_5_MINI;

    static readonly configSchema: z.ZodType<InputConfig> = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;

    // This model does not support explicit prompt cache breakpoints. They are
    // only supported starting with GPT-5.6.
    // https://developers.openai.com/api/docs/guides/prompt-caching#prompt-cache-breakpoints
    promptCacheBreakpointFor = () => ({});
  }

  return OpenAIGptFiveMini;
}
