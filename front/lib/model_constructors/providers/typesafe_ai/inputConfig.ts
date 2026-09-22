import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { z } from "zod";

// System-one requests carry their own vocabulary (a state and named questions)
// and expose none of the chat generation knobs: there is no sampling
// temperature, no reasoning effort, no tools, no structured output and no
// prompt cache. Narrowing each to `z.undefined()` rather than omitting it makes
// a caller that sets one fail validation instead of having it silently dropped.
export const typeSafeAiConfigSchema = inputConfigSchema.extend({
  temperature: z.undefined(),
  reasoning: z.undefined(),
  conciseReasoningSummary: z.undefined(),
  tools: z.undefined(),
  forceTool: z.undefined(),
  disableToolUse: z.undefined(),
  toolSearchEnabled: z.undefined(),
  outputFormat: z.undefined(),
  cacheKey: z.undefined(),
  serviceTier: z.undefined(),
});

export type TypeSafeAiInputConfig = z.infer<typeof typeSafeAiConfigSchema>;
