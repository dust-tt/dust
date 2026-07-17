import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import type { AnthropicSupportedNonNullReasoningEffort } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import type { ModelId } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

// Shared input contract for the Claude Opus 4.x models (4.6, 4.7, 4.8): same
// context window, output cap, and temperature handling. Reasoning efforts vary
// slightly (4.6 does not support `xhigh`), so they are passed per model.
export const OPUS_CONTEXT_SIZE = 250_000;
export const OPUS_MAX_OUTPUT_TOKENS = 64_000;

const DEFAULT_REASONING_EFFORT = "high";

const baseConfig = inputConfigSchema.extend({
  cacheKey: z.undefined(),
});

function getConfigSchema(
  supportedEfforts: readonly [
    AnthropicSupportedNonNullReasoningEffort,
    ...AnthropicSupportedNonNullReasoningEffort[],
  ],
) {
  return z.union([
    baseConfig.extend({
      reasoning: z
        .object({
          effort: z.enum(supportedEfforts),
        })
        .default({ effort: DEFAULT_REASONING_EFFORT }),
      forceTool: z.undefined(),
    }),
    baseConfig.extend({
      reasoning: z.object({ effort: z.literal("none") }),
    }),
  ]);
}

// The shared config type is the superset (all efforts); per-model schemas
// enforce their own subset at runtime.
export const opusConfigSchema = getConfigSchema(
  ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS,
);

export type AnthropicOpusInputConfig = z.infer<typeof opusConfigSchema>;

// Builds the config mixin shared by every Claude Opus 4.x model. The models
// only differ by `modelId`; everything else (schema, context window, output
// cap) is identical, so each model file is a one-line binding of this factory.
export function withAnthropicOpusConfig<const M extends ModelId>(
  modelId: M,
  supportedEfforts: readonly [
    AnthropicSupportedNonNullReasoningEffort,
    ...AnthropicSupportedNonNullReasoningEffort[],
  ] = ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS,
) {
  const configSchema = getConfigSchema(supportedEfforts);

  return function WithAnthropicOpusConfig<
    TBase extends abstract new (...args: any[]) => object,
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
      > = configSchema;

      static readonly contextSize = OPUS_CONTEXT_SIZE;
      static readonly maxOutputTokens = OPUS_MAX_OUTPUT_TOKENS;
    }

    return AnthropicClaudeOpus;
  };
}
