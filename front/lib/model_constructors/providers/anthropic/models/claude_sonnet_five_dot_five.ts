import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { anthropicBaseConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { CLAUDE_SONNET_5_5 } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// Real model spec. The Dust product cap (250k) is applied in the llms layer.
// https://platform.claude.com/docs/en/models/sonnet-5-5/overview (2026-09-28).
const CONTEXT_SIZE = 1_000_000;
const MAX_OUTPUT_TOKENS = 128_000;

// Anthropic's own `output_config.effort` default for this model:
// https://platform.claude.com/docs/en/build-with-claude/effort (2026-09-28).
const DEFAULT_REASONING_EFFORT = "high";

// Standalone rather than shared with Sonnet 5: Sonnet 5.5 breaks with it on
// thinking and on forced tool use.
// https://platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5
// Characterized against the live API (2026-09-28) with the widest
// `inputConfigSchema`:
//
//   - A forced `tool_choice` ("any" or "tool") returns a 400: *"tool_choice:
//     type \"tool\" and \"any\" are not supported for this model."* Sonnet 5
//     accepts it. Hence `forceTool: z.undefined()`.
//   - `thinking: {type: "disabled"}` returns a 400 pointing to
//     `thinking.type.between_tools` as the lowest setting, so effort "none" is
//     out. `between_tools` is not modeled by the converter.
//   - Any `temperature` other than `1` returns a 400, as on Sonnet 5. Hence
//     `z.literal(1)`; the Dust layer drops it anyway via `dropTemperature`.
//   - low/medium/high/xhigh/max are all accepted. "minimal" has no Anthropic
//     equivalent and `assertNever`s in the converter.
const configSchema = anthropicBaseConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS),
    })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
  forceTool: z.undefined(),
  temperature: z.literal(1).optional().default(1),
});

export type ClaudeSonnetFiveDotFive = z.infer<typeof configSchema>;

export function WithAnthropicClaudeSonnetFiveDotFiveConfig<
  TBase extends abstract new (...args: any[]) => object,
>(Base: TBase) {
  abstract class AnthropicClaudeSonnetFiveDotFive extends Base {
    declare ["constructor"]: BaseEndpointConfiguration<ClaudeSonnetFiveDotFive>;

    static readonly model = CLAUDE_SONNET_5_5;

    static readonly configSchema: z.ZodType<
      ClaudeSonnetFiveDotFive,
      z.ZodTypeDef,
      unknown
    > = configSchema;

    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly contextSize: number = CONTEXT_SIZE;
    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return AnthropicClaudeSonnetFiveDotFive;
}
