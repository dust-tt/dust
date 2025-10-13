import type { ModelConfigurationType } from "@app/types";

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
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  featureFlag: "noop_model_feature",
};
