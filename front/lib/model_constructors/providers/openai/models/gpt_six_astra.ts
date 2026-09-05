import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { GPT_6_ASTRA } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// Verified 2026-09-05: https://developers.openai.com/api/docs/models/gpt-6-astra
const CONTEXT_SIZE = 1_050_000;
const MAX_OUTPUT_TOKENS = 128_000;

// Verified 2026-09-05: https://developers.openai.com/api/docs/models/gpt-6-astra
// Native "max" is represented as "maximal" by our Responses converter.
// The live global and EU APIs reject none/minimal and non-default temperatures,
// but accept temperature: 1. An omitted effort returns reasoning.effort: "medium".
const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(["low", "medium", "high", "xhigh", "maximal"]),
    })
    .default({ effort: "medium" }),
  temperature: z.literal(1).optional(),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithOpenAIGptSixAstraConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class OpenAIGptSixAstra extends Base {
    static readonly model = GPT_6_ASTRA;

    static readonly configSchema: z.ZodType<InputConfig> = configSchema;

    // Widen the literal so the Dust layer can cap the native context.
    static readonly contextSize: number = CONTEXT_SIZE;
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return OpenAIGptSixAstra;
}
