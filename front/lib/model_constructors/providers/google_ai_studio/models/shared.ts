import { GEMINI_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/google_ai_studio/reasoning_efforts";
import {
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";

import { z } from "zod";

// Shared config for Gemini 3.x models that expose the full set of native
// thinking levels (Flash, Flash-Lite). Pro narrows this further (no `minimal`),
// so it defines its own schema; the capability constants are still reused.

// Verified against https://ai.google.dev/gemini-api/docs/models (2026-06-18):
// Gemini 3.x has a 1M-token context window and up to 64k output tokens.
export const GEMINI_3_CONTEXT_SIZE = 1_000_000;
export const GEMINI_3_MAX_OUTPUT_TOKENS = 65_536;

const DEFAULT_REASONING_EFFORT = "high";

const baseConfig = inputConfigSchema.extend({
  // Gemini uses implicit caching; we do not pass an explicit cache key.
  cacheKey: z.undefined(),
});

// Supports all native thinking levels (minimal/low/medium/high) and strongly
// recommends `temperature: 1`, so we coerce temperature to 1.
export const geminiV3ConfigSchema = baseConfig.extend({
  reasoning: z
    .object({
      effort: z.enum([...GEMINI_SUPPORTED_REASONING_EFFORTS]),
    })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
  temperature: temperatureSchema.optional().transform(() => 1 as const),
});
