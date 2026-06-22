import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import {
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";

import { z } from "zod";

// Shared input contract for the Claude Opus 4.x models (4.7, 4.8): same context
// window, output cap, reasoning efforts, and temperature handling.
export const OPUS_CONTEXT_SIZE = 250_000;
export const OPUS_MAX_OUTPUT_TOKENS = 64_000;

const DEFAULT_REASONING_EFFORT = "high";

const baseConfig = inputConfigSchema.extend({
  cacheKey: z.undefined(),
  // Opus rejects any explicit temperature !== 1.
  temperature: temperatureSchema.optional().transform(() => 1 as const),
});

export const opusConfigSchema = z.union([
  baseConfig.extend({
    reasoning: z
      .object({
        effort: z.enum(ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS),
      })
      .default({ effort: DEFAULT_REASONING_EFFORT }),
    forceTool: z.undefined(),
  }),
  baseConfig.extend({
    reasoning: z.object({ effort: z.literal("none") }),
  }),
]);

export type AnthropicOpusInputConfig = z.infer<typeof opusConfigSchema>;
