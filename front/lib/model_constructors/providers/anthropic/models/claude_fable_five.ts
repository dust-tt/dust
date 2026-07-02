import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import {
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { CLAUDE_FABLE_5_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

// Kept aligned with the existing static Fable 5 model config for this rollout.
const CONTEXT_SIZE = 250_000;
const DEFAULT_REASONING_EFFORT = "medium";
const MAX_OUTPUT_TOKENS = 64_000;
const MIN_REASONING_EFFORT = "low";

const reasoningSchema = z
  .union([
    z.object({
      effort: z.enum(ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS),
    }),
    // Fable has adaptive thinking always on. Preserve legacy-router behavior:
    // callers that default to "none" are clamped to the minimum native effort.
    z
      .object({ effort: z.literal("none") })
      .transform((): { effort: typeof MIN_REASONING_EFFORT } => ({
        effort: MIN_REASONING_EFFORT,
      })),
  ])
  .default({ effort: DEFAULT_REASONING_EFFORT });

const configSchema = inputConfigSchema.extend({
  cacheKey: z.undefined(),
  reasoning: reasoningSchema,
  // Fable has adaptive thinking always on; omit explicit temperature rather
  // than sending a value that can conflict with the thinking configuration.
  temperature: temperatureSchema.optional().transform(() => undefined),
});

export type ClaudeFableFive = z.infer<typeof configSchema>;

export function WithAnthropicClaudeFableFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class AnthropicClaudeFableFive extends Base {
    declare ["constructor"]: BaseEndpointConfiguration<ClaudeFableFive>;

    static readonly modelId = CLAUDE_FABLE_5_MODEL_ID;

    static readonly configSchema: z.ZodType<
      ClaudeFableFive,
      z.ZodTypeDef,
      unknown
    > = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return AnthropicClaudeFableFive;
}
