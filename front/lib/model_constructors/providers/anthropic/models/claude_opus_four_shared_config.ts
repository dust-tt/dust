import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import {
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import type { ModelId } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

// Shared input contract for the Claude Opus 4.x models (4.6, 4.7, 4.8): same
// context window, output cap, reasoning efforts, and temperature handling.
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

// Builds the config mixin shared by every Claude Opus 4.x model. The models
// only differ by `modelId`; everything else (schema, context window, output
// cap) is identical, so each model file is a one-line binding of this factory.
export function makeAnthropicOpusConfigMixin<const M extends ModelId>(
  modelId: M
) {
  return function WithAnthropicOpusConfig<
    TBase extends abstract new (
      ...args: any[]
    ) => object,
  >(Base: TBase) {
    abstract class AnthropicClaudeOpus extends Base {
      // Narrow `Client`'s `["constructor"]` to this model's precise config so
      // the instance type carries the Opus config (not the wide `InputConfig`).
      declare ["constructor"]: BaseEndpointConfiguration<AnthropicOpusInputConfig>;

      static readonly modelId = modelId;

      static readonly configSchema: z.ZodType<
        AnthropicOpusInputConfig,
        z.ZodTypeDef,
        unknown
      > = opusConfigSchema;

      static readonly contextSize = OPUS_CONTEXT_SIZE;
      static readonly maxOutputTokens = OPUS_MAX_OUTPUT_TOKENS;
    }

    return AnthropicClaudeOpus;
  };
}
