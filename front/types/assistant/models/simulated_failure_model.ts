import { GPT_5_4_MINI_MODEL_CONFIG } from "./openai";
import type { ModelConfigurationType } from "./types";

export const SIMULATED_FAILURE_MODEL_ID = "simulated-failure-model" as const;

// Internal synthetic model: its healthy endpoint delegates to GPT-5.4 Mini, so
// its advertised capabilities intentionally mirror that model.
export const SIMULATED_FAILURE_MODEL_CONFIG: ModelConfigurationType = {
  ...GPT_5_4_MINI_MODEL_CONFIG,
  modelId: SIMULATED_FAILURE_MODEL_ID,
  displayName: "Simulated Failure Model",
  description: "Internal synthetic model for controlled provider failures.",
  shortDescription: "Internal simulated failure model.",
  isLatest: false,
  availableIfOneOf: {
    featureFlag: "simulated_failure_model_feature",
  },
};
