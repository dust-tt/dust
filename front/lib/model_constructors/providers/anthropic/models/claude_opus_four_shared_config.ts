import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { anthropicBaseConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import type { Model } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// Shared input contract for Claude Opus 4.7, 4.8 and 5 — identical config: same
// context window, output cap, the full reasoning-effort set (incl. `xhigh`/
// `max`), and no caller-supplied temperature (non-default temperature/top_p/
// top_k are rejected with a 400 on Opus 4.7+). Opus 4.6 differs on both axes
// (no `xhigh`, and it accepts a temperature), so it has its own config in
// `claude_opus_four_dot_six.ts` rather than sharing this one.
// Real model spec. The Dust product cap (250k) is applied in the llms layer.
const OPUS_CONTEXT_SIZE = 1_000_000;
const OPUS_MAX_OUTPUT_TOKENS = 128_000;

const DEFAULT_REASONING_EFFORT = "high";

const baseConfig = anthropicBaseConfigSchema.extend({
  temperature: z.undefined(),
});

const opusConfigSchema = z.union([
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

// Builds the config mixin shared by Claude Opus 4.7, 4.8 and 5. The models differ
// only by `modelId`; everything else (schema, context window, output cap) is
// identical, so each model file is a one-line binding of this factory.
export function withAnthropicOpusConfig<const M extends Model>(modelId: M) {
  return function WithAnthropicOpusConfig<
    TBase extends abstract new (
      ...args: any[]
    ) => object,
  >(Base: TBase) {
    abstract class AnthropicClaudeOpus extends Base {
      // Narrow `Client`'s `["constructor"]` to this model's precise config so
      // the instance type carries the Opus config (not the wide `InputConfig`).
      declare ["constructor"]: BaseEndpointConfiguration<AnthropicOpusInputConfig>;

      static readonly model = modelId;

      static readonly configSchema: z.ZodType<
        AnthropicOpusInputConfig,
        z.ZodTypeDef,
        unknown
      > = opusConfigSchema;

      // Typed as `number` (not the literal) so the Dust layer can cap it.
      static readonly contextSize: number = OPUS_CONTEXT_SIZE;
      // Typed as `number` (not the literal) so the Dust layer can cap it.
      static readonly maxOutputTokens: number = OPUS_MAX_OUTPUT_TOKENS;
    }

    return AnthropicClaudeOpus;
  };
}
