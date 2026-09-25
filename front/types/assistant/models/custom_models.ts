import { HOSTS } from "@app/lib/model_constructors/types/hosts";
import { LABS } from "@app/lib/model_constructors/types/labs";
import { ORDERED_REASONING_EFFORTS } from "@app/lib/model_constructors/types/reasoning_efforts";
import { REGIONS } from "@app/lib/model_constructors/types/regions";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { ModelConfigurationSchema } from "@app/types/assistant/models/types";
import { z } from "zod";

// Custom models are only reachable by workspaces with this flag, never by BYOK ones.
export const CUSTOM_MODEL_FEATURE_FLAG = "custom_model_feature" as const;

const reasoningEffortSchema = z.enum(ORDERED_REASONING_EFFORTS);

// Describes any endpoint; which lab/host/region combinations can actually be served is
// decided by the endpoint factory (`validateCustomModelEndpoint`).
export const CustomModelEndpointSchema = z
  .object({
    lab: z.enum(LABS),
    host: z.enum(HOSTS),
    region: z.enum(REGIONS),
    maxOutputTokens: z.number().int().positive(),
    tokenPricing: z.object({
      standardInput: z.number(),
      standardOutput: z.number(),
      cacheCreated: z.number().optional(),
      shortCacheCreated: z.number().optional(),
      longCacheCreated: z.number().optional(),
      cacheHit: z.number().optional(),
    }),
    input: z.object({
      // Router vocabulary (e.g. `maximal`), not the product one.
      reasoningEfforts: z.array(reasoningEffortSchema).nonempty(),
      defaultReasoningEffort: reasoningEffortSchema,
      supportsForcedTool: z.boolean(),
    }),
  })
  .refine(
    ({ input }) =>
      input.reasoningEfforts.includes(input.defaultReasoningEffort),
    { message: "defaultReasoningEffort must be one of reasoningEfforts" }
  );

export type CustomModelEndpointType = z.infer<typeof CustomModelEndpointSchema>;

/**
 * @cc [owner:pmilliotte,label:security;product] custom-models-are-flag-gated
 * Every custom model is parsed with `availableIfOneOf` gated on `CUSTOM_MODEL_FEATURE_FLAG`, which
 * keeps it away from unflagged workspaces. It may run on the Dust-managed key or, with
 * `useEapKey`, on the dedicated one: BYOK exclusion does not depend on the key (see
 * `custom-models-are-never-byok-reachable`).
 */
export const CustomModelSchema = z.object({
  // Strict so a field the router does not read fails the build instead of being ignored.
  modelConfig: ModelConfigurationSchema.extend({
    availableIfOneOf: z
      .object({ featureFlag: z.literal(CUSTOM_MODEL_FEATURE_FLAG) })
      .strict(),
  }).strict(),
  endpoint: CustomModelEndpointSchema,
});

export const CustomModelsFileSchema = z.object({
  version: z.literal(2),
  models: z.array(CustomModelSchema),
});

export type CustomModelType = {
  modelConfig: ModelConfigurationType;
  endpoint: CustomModelEndpointType;
};
