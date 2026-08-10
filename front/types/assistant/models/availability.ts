import type { ModelConfigurationType } from "./types";

export const OPUS_AND_SOL_MODEL_AVAILABILITY = {
  creditPricedPlan: true,
  plansWithAdvancedModels: true,
  featureFlag: "claude_4_5_opus_feature",
} satisfies NonNullable<ModelConfigurationType["availableIfOneOf"]>;
