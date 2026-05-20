import type { ModelConfigurationType } from "./types";

export const NOOP_MODEL_ID = "noop" as const;
export const NOOP_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "noop",
  modelId: NOOP_MODEL_ID,
  displayName: "Noop",
  contextSize: 1_000_000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "Noop model that does nothing.",
  shortDescription: "Noop model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: false,
  supportedReasoningEfforts: {
    none: true,
    light: false,
    medium: false,
    high: false,
  },
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  availableIfOneOf: {
    featureFlag: "noop_model_feature",
  },
  tokenizer: { type: "tiktoken", base: "o200k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": false,
  },
};
