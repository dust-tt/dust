import { HOSTS } from "@app/lib/model_constructors/types/hosts";
import { LABS } from "@app/lib/model_constructors/types/labs";
import { ORDERED_REASONING_EFFORTS } from "@app/lib/model_constructors/types/reasoning_efforts";
import { REGIONS } from "@app/lib/model_constructors/types/regions";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { ModelConfigurationSchema } from "@app/types/assistant/models/types";
import kebabCase from "lodash/kebabCase";
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
    // Model name sent to the host API. Server-only: clients only ever see `modelConfig.modelId`.
    hostModel: z.string().min(1),
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
/**
 * @cc [owner:pmilliotte,label:security;product] custom-model-host-name-stays-server-side
 * A custom model's `modelConfig.modelId` and `displayName` are what agent configs, messages,
 * analytics and exports carry to clients, so `displayName` is a made-up name that never contains
 * the `endpoint.hostModel` sent to the host API, and `modelId` is its kebab case. Only the
 * endpoint factory reads `hostModel`.
 */
export const CustomModelSchema = z
  .object({
    // Strict so a field the router does not read fails the build instead of being ignored.
    modelConfig: ModelConfigurationSchema.extend({
      availableIfOneOf: z
        .object({ featureFlag: z.literal(CUSTOM_MODEL_FEATURE_FLAG) })
        .strict(),
    }).strict(),
    endpoint: CustomModelEndpointSchema,
  })
  .refine(
    ({ modelConfig }) =>
      modelConfig.modelId === kebabCase(modelConfig.displayName),
    { message: "modelId must be the kebab case of displayName" }
  )
  .refine(
    ({ modelConfig, endpoint }) =>
      !kebabCase(modelConfig.displayName).includes(
        kebabCase(endpoint.hostModel)
      ),
    { message: "displayName must not contain endpoint.hostModel" }
  );

export const CustomModelsFileSchema = z.object({
  version: z.literal(2),
  models: z.array(CustomModelSchema),
});

export type CustomModelType = {
  modelConfig: ModelConfigurationType;
  endpoint: CustomModelEndpointType;
};
