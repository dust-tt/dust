import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import {
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { CLAUDE_SONNET_4_6_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

const DISPLAY_NAME = "Claude Sonnet 4.6";
const SHORT_DESCRIPTION = "Anthropic's latest balanced model.";
const DESCRIPTION =
  "Anthropic's Claude Sonnet 4.6 model, balancing power and efficiency with enhanced reasoning capabilities (200k context).";

const CONTEXT_SIZE = 400_000;
const DEFAULT_REASONING_EFFORT = "high";
const MAX_OUTPUT_TOKENS = 64_000;

const baseConfig = inputConfigSchema.extend({
  cacheKey: z.undefined(),
});

// The Claude Sonnet 4.6 input schema. Exported so each surface leaf can assign
// it to its own `configSchema` static — the surface owns that field, but the
// stream and batch leaves share this schema today.
const configSchema = z.union([
  baseConfig.extend({
    reasoning: z
      .object({
        effort: z.enum(ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS),
      })
      .default({ effort: DEFAULT_REASONING_EFFORT }),
    forceTool: z.undefined(),
    // Reasoning requires temperature=1; accept any value but coerce to 1.
    temperature: temperatureSchema.optional().transform(() => 1 as const),
  }),
  baseConfig.extend({
    reasoning: z.object({ effort: z.literal("none") }),
    temperature: temperatureSchema.optional().default(1),
  }),
]);

// Shared configuration for Claude Sonnet 4.6, regardless of inference surface
// (streaming vs. batch). It is a class-expression mixin rather than a base class
// because the streaming and batch leaves extend *different* runtime bases
// (`AnthropicStream` / `AnthropicBatch`), and TypeScript statics only flow down a
// single chain. Applying this mixin to each base injects the same static
// identity/capability fields into both, keeping them in sync by construction.
//
// It carries everything EXCEPT `configSchema`, which each surface leaf assigns
// itself (from `claudeSonnetFourDotSixConfigSchema` above) so a surface can
// diverge if its accepted input ever differs.
export function WithAnthropicClaudeSonnetFourDotSixConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class AnthropicClaudeSonnetFourDotSix extends Base {
    static readonly modelId = CLAUDE_SONNET_4_6_MODEL_ID;

    static readonly configSchema = configSchema;

    static readonly displayName = DISPLAY_NAME;
    static readonly shortDescription = SHORT_DESCRIPTION;
    static readonly description = DESCRIPTION;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly defaultReasoningEffort = DEFAULT_REASONING_EFFORT;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;

    static readonly featureFlags = [];
  }

  return AnthropicClaudeSonnetFourDotSix;
}
