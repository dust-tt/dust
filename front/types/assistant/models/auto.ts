import type { ModelConfigurationType } from "./types";

export const AUTO_MODEL_ID = "auto" as const;
export const AUTO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: AUTO_MODEL_ID,
  modelId: AUTO_MODEL_ID,
  displayName: "Auto: Dust handles model selection",
  description: "Let Dust select the best model for the task.",
  shortDescription: "Select the best model for the task.",

  // Everything below is just some value to make it compatible with the ModelConfigurationType.
  // This model configuration will be dynamically routed to the best model for the task.
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  availableIfOneOf: {
    featureFlag: "models_picker",
  },
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};
