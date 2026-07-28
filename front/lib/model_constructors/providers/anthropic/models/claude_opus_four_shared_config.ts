import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { anthropicBaseConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import type { Model } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// Shared input contract for the Opus family. It tracks the latest member —
// Opus 5 — so the next Opus can bind it as-is; older models that diverge get an
// override rather than the baseline being held back for them. As of 2026-07-27
// Opus 4.7, 4.8 and 5 are identical on every axis, so none of them needs one.
// Opus 4.6 differs on two (no `xhigh`, and it accepts a real temperature), so
// it has its own config in `claude_opus_four_dot_six.ts` rather than sharing
// this one.
// Real model spec. The Dust product cap (250k) is applied in the llms layer.
const OPUS_CONTEXT_SIZE = 1_000_000;
const OPUS_MAX_OUTPUT_TOKENS = 128_000;

const DEFAULT_REASONING_EFFORT = "high";

// Characterized against the live API on Opus 5 (2026-07-27) by running the
// endpoint suite with the widest `inputConfigSchema`, then sweeping the
// interesting payloads across 4.7, 4.8 and 5 — all three behave identically.
// Two constraints shape the schema:
//
//   - `temperature` accepts exactly one value: `1` (or absent, which means the
//     same thing — 1 is the API default). Anything in [0, 1) is a 400 —
//     "`temperature` is deprecated for this model" with thinking off,
//     "`temperature` may only be set to 1 when thinking is enabled or in
//     adaptive mode" with thinking on — and anything above 1 fails the
//     `range: 0..1` check. Hence `z.literal(1)`, defaulted so callers can omit
//     it. The Dust layer strips it anyway via the `dropTemperature` config
//     parser, but the endpoint schema mirrors the API rather than that policy.
//   - Effort "minimal" has no Anthropic equivalent and `assertNever`s in the
//     converter, so it is excluded from the effort enum.
//
// Forcing a tool needs no special handling: all three models accept a forced
// `tool_choice` alongside adaptive thinking (verified live on 4.7, 4.8 and 5 —
// each returned a `tool_use` block). That restriction belongs to *extended*
// thinking ("Thinking may not be enabled when tool_choice forces tool use",
// still true on Haiku 4.5), not to the adaptive thinking these models use.
const opusConfigSchema = anthropicBaseConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum([
        ...ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS,
        "none",
      ]),
    })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
  temperature: z.literal(1).optional().default(1),
});

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
