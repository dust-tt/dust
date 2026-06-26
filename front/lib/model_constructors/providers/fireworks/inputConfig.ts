import { FIREWORKS_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/fireworks/reasoning_efforts";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { z } from "zod";

// Widest Fireworks reasoning contract. Per-model schemas narrow it (and decide
// whether `temperature` passes through), so the client-level schema only needs
// to admit every effort some Fireworks model accepts.
export const fireworksConfigSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(FIREWORKS_SUPPORTED_REASONING_EFFORTS),
    })
    .optional(),
  // Fireworks has no explicit prompt-cache key.
  cacheKey: z.undefined(),
});

export type FireworksInputConfig = z.infer<typeof fireworksConfigSchema>;
