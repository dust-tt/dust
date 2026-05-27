import { describe, expect, it } from "vitest";

import { ModelConfigurationSchema } from "./types";

const MODEL_CONFIG = {
  providerId: "openai",
  modelId: "custom-model-for-schema-test",
  displayName: "Custom model for schema test",
  contextSize: 1_000_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "Custom model for schema test.",
  shortDescription: "Custom model.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 128_000,
  supportsVision: true,
  supportedReasoningEfforts: {
    none: true,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  useNativeLightReasoning: true,
  supportsResponseFormat: true,
  supportsBatchProcessing: true,
  tokenizer: { type: "tiktoken", base: "r50k_base" },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
  availableIfOneOf: {
    featureFlag: "custom_model_feature",
  },
  customAvailableIf: {
    featureFlag: "custom_model_feature",
  },
};

describe("ModelConfigurationSchema", () => {
  it("preserves availability fields for custom models", () => {
    const result = ModelConfigurationSchema.parse(MODEL_CONFIG);

    expect(result.regionalAvailability).toEqual({
      "us-central1": true,
      "europe-west1": true,
    });
    expect(result.availableIfOneOf).toEqual({
      featureFlag: "custom_model_feature",
    });
    expect(result.customAvailableIf).toEqual({
      featureFlag: "custom_model_feature",
    });
  });

  it("rejects unknown availability feature flags", () => {
    expect(() =>
      ModelConfigurationSchema.parse({
        ...MODEL_CONFIG,
        availableIfOneOf: {
          featureFlag: "unknown_feature",
        },
      })
    ).toThrow();
  });
});
