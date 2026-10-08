import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { anthropicBaseConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { CLAUDE_HAIKU_5_5 } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// Real model spec. The Dust product cap (250k) is applied in the llms layer.
// https://platform.claude.com/docs/en/models/haiku-5-5/overview (2026-10-08).
const CONTEXT_SIZE = 1_000_000;
const MAX_OUTPUT_TOKENS = 128_000;

// Anthropic's own `output_config.effort` default for this model:
// https://platform.claude.com/docs/en/build-with-claude/effort (2026-10-08).
const DEFAULT_REASONING_EFFORT = "medium";

// Standalone rather than shared with Haiku 4.5, which has extended thinking
// only. https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide
// Characterized against the live API (2026-10-08) with the widest
// `inputConfigSchema`:
//
//   - low/medium/high/xhigh/max are documented and all accepted. "minimal" has
//     no Anthropic equivalent and `assertNever`s in the converter.
//   - `thinking: {type: "disabled"}` is documented as accepted at effort `high`
//     or below. Effort "none" sends it without `output_config`, so it runs at
//     the `medium` default; accepted.
//   - Any `temperature` other than `1` is a 400, with thinking on or off.
//     Hence `z.literal(1)`; the Dust layer drops it anyway via
//     `dropTemperature`.
//   - A forced `tool_choice` is accepted at every effort, including "none";
//     the response then skips thinking.
const configSchema = anthropicBaseConfigSchema.extend({
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

export type ClaudeHaikuFiveDotFive = z.infer<typeof configSchema>;

export function WithAnthropicClaudeHaikuFiveDotFiveConfig<
  TBase extends abstract new (...args: any[]) => object,
>(Base: TBase) {
  abstract class AnthropicClaudeHaikuFiveDotFive extends Base {
    declare ["constructor"]: BaseEndpointConfiguration<ClaudeHaikuFiveDotFive>;

    static readonly model = CLAUDE_HAIKU_5_5;

    static readonly configSchema: z.ZodType<
      ClaudeHaikuFiveDotFive,
      z.ZodTypeDef,
      unknown
    > = configSchema;

    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly contextSize: number = CONTEXT_SIZE;
    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return AnthropicClaudeHaikuFiveDotFive;
}
