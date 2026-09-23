import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { anthropicBaseConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { CLAUDE_OPUS_5_5 } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// Real model spec. The Dust product cap (250k) is applied in the llms layer.
// https://platform.claude.com/docs/en/models/opus-5-5/overview (2026-09-22).
const CONTEXT_SIZE = 1_000_000;
const MAX_OUTPUT_TOKENS = 128_000;

// Anthropic's own `output_config.effort` default for this model. Opus 5.5 is
// the one current model whose default is `medium` rather than `high`:
// https://platform.claude.com/docs/en/build-with-claude/effort (2026-09-22).
const DEFAULT_REASONING_EFFORT = "medium";

// Opus 5.5 keeps a standalone config rather than binding
// `withAnthropicOpusConfig`: it breaks with Opus 4.7/4.8/5 on thinking and on
// forced tool use, which is exactly the kind of divergence a shared config
// would paper over. The shared config stays as-is for 4.7/4.8/5 — those three
// remain identical to each other — so nothing is held back by this split.
//
// Contract taken from Anthropic's own documentation (2026-09-22), which spells
// out what carries over from Opus 5 and what changed:
// https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5
//
//   - Forced tool use is a hard 400 on this model: `tool_choice` of type
//     "any" or "tool" returns *"tool_choice: type \"tool\" and \"any\" are not
//     supported for this model."*, on the token-counting endpoint too. So
//     `forceTool` is pinned to `undefined`. This is a breaking change against
//     Opus 5, which accepts a forced `tool_choice`.
//   - `thinking: {type: "disabled"}` returns a 400 *at every effort level* —
//     *"\"thinking.type.disabled\" is not supported for this model. Use
//     \"thinking.type.adaptive\" and \"output_config.effort\" to control
//     thinking behavior."* Opus 5 accepted it at effort `high` and below.
//     Effort "none" is therefore out, and an absent reasoning must default to
//     a real effort rather than fall through to disabled.
//   - `thinking: {type: "enabled"}` with `budget_tokens` 400s as well,
//     unchanged from Opus 5.
//   - Non-default `temperature`, `top_p` or `top_k` return a 400, unchanged
//     from Opus 5. Hence `z.literal(1)`, defaulted so callers can omit it. The
//     Dust layer strips it anyway via the `dropTemperature` config parser, but
//     the endpoint schema mirrors the API rather than that policy.
//
// All five effort levels (low/medium/high/xhigh/max) are supported:
// https://platform.claude.com/docs/en/build-with-claude/effort (2026-09-22).
// "minimal" has no Anthropic equivalent and `assertNever`s in the converter, so
// the schema allows low/medium/high/xhigh/maximal only.
const reasoningSchema = z
  .object({
    effort: z.enum(ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS),
  })
  .default({ effort: DEFAULT_REASONING_EFFORT });

const configSchema = anthropicBaseConfigSchema.extend({
  reasoning: reasoningSchema,
  forceTool: z.undefined(),
  temperature: z.literal(1).optional().default(1),
});

export type ClaudeOpusFiveDotFive = z.infer<typeof configSchema>;

export function WithAnthropicClaudeOpusFiveDotFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class AnthropicClaudeOpusFiveDotFive extends Base {
    declare ["constructor"]: BaseEndpointConfiguration<ClaudeOpusFiveDotFive>;

    static readonly model = CLAUDE_OPUS_5_5;

    static readonly configSchema: z.ZodType<
      ClaudeOpusFiveDotFive,
      z.ZodTypeDef,
      unknown
    > = configSchema;

    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly contextSize: number = CONTEXT_SIZE;
    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return AnthropicClaudeOpusFiveDotFive;
}
