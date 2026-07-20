import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { z } from "zod";

// Shared base for the per-model Anthropic config schemas. Carries the two
// Anthropic-only fields every model needs: the `cacheKey` guard and the
// prompt-cache diagnostics opt-in. Each model schema extends this (rather than
// the generic `inputConfigSchema`) so `buildConfig`'s `parse` keeps
// `previousMessageId` instead of stripping it as an unknown key.
// Prompt-cache diagnostics (Claude API only): undefined = off, null = on
// (first call), string = previous response id to diagnose against.
export const anthropicBaseConfigSchema = inputConfigSchema.extend({
  cacheKey: z.undefined(),
  previousMessageId: z.string().nullable().optional(),
});

export const anthropicConfigSchema = anthropicBaseConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum([
        ...ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS,
        "none",
      ]),
    })
    .optional(),
});

export type AnthropicInputConfig = z.infer<typeof anthropicConfigSchema>;
