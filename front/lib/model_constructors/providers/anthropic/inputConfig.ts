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
// Every model schema extending this must either `.default(...)` its `reasoning`
// or pin it to a literal effort: an absent `reasoning` sends no thinking config
// at all and lets Anthropic apply the model's own default (see
// `reasoningToThinkingConfig`), which differs per model — adaptive on Fable 5 /
// Opus 5 / Sonnet 5, but thinking-*off* on Opus 4.8/4.7/4.6 and Sonnet 4.6.
// Dust wants reasoning on by default everywhere, so the default lives in the
// schema rather than being inherited from the API.
//
// `high` is also Anthropic's own `output_config.effort` default. Verified
// against the live API on Fable 5 (2026-07-27): on a fixed reasoning prompt,
// omitting `output_config` spent 214 thinking tokens vs 195 at `high`, 47 at
// `low` and 475 at `max`.
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
