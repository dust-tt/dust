import { AnthropicBatch } from "@app/lib/model_constructors/batch/clients/anthropic";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { WithAnthropicClaudeSonnetFourDotSixConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_sonnet_four_dot_six";
import {
  inputConfigSchema,
  reasoningSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

import { z } from "zod";

export const batchConfigSchema = inputConfigSchema.extend({
  reasoning: reasoningSchema
    .optional()
    .transform(() => ({ effort: "none" }) as const),
  temperature: temperatureSchema.optional().transform(() => 1 as const),
  cacheKey: z.undefined(),
});

export class AnthropicGlobalClaudeSonnetFourDotSixBatch extends WithAnthropicClaudeSonnetFourDotSixConfig(
  AnthropicBatch
) {
  static readonly configSchema = batchConfigSchema;

  // Batch pricing is half the standard Anthropic rate.
  static readonly tokenPricing = {
    standardInput: 1.5,
    standardOutput: 7.5,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

AnthropicGlobalClaudeSonnetFourDotSixBatch satisfies BatchEndpointConstructor;
