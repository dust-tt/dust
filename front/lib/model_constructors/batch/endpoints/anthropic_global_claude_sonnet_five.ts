import { AnthropicBatch } from "@app/lib/model_constructors/batch/clients/anthropic";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { WithAnthropicClaudeSonnetFiveConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_sonnet_five";
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

export class AnthropicGlobalClaudeSonnetFiveBatch extends WithAnthropicClaudeSonnetFiveConfig(
  AnthropicBatch
) {
  static readonly configSchema = batchConfigSchema;

  // Batch pricing is half the standard Anthropic rate.
  // TODO(2026-08-31): intro pricing ends; revert to standard rates
  // (standardInput 1.5, standardOutput 7.5).
  static readonly tokenPricing = {
    standardInput: 1.0,
    standardOutput: 5.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

AnthropicGlobalClaudeSonnetFiveBatch satisfies BatchEndpointConstructor;
