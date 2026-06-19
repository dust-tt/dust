import type { ModelConfigurationType } from "./types";

// "dust" is a meta-provider: it never reaches an inference provider. The single
// model it exposes, "auto", is a sentinel that is resolved at runtime to the
// workspace's configured default model (with an outage backup). Mirrors the
// existing "noop" meta-provider/model treatment.
export const AUTO_PROVIDER_ID = "dust" as const;
export const AUTO_MODEL_ID = "auto" as const;

export const AUTO_MODEL_CONFIG: ModelConfigurationType = {
  providerId: AUTO_PROVIDER_ID,
  modelId: AUTO_MODEL_ID,
  displayName: "Auto",
  // Advertised capabilities are a superset; the resolved model's capabilities
  // are what actually apply at runtime. Mirrors Claude Sonnet 4.6 (the initial
  // default) so token-budget math in the builder stays sensible.
  contextSize: 250_000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description:
    "Dust picks the best model for you at runtime and automatically fails over to a backup model during provider outages.",
  shortDescription: "Dust-managed model with automatic backup.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 64_000,
  supportsVision: true,
  supportsResponseFormat: true,
  supportedReasoningEfforts: {
    none: false,
    light: true,
    medium: true,
    high: true,
  },
  defaultReasoningEffort: "medium",
  tokenizer: { type: "tiktoken", base: "anthropic_base" },
  availableIfOneOf: {
    featureFlag: "auto_model_tier",
  },
  regionalAvailability: {
    "us-central1": true,
    "europe-west1": true,
  },
};

export function isAutoModel(m: {
  providerId: string;
  modelId: string;
}): boolean {
  return m.providerId === AUTO_PROVIDER_ID && m.modelId === AUTO_MODEL_ID;
}
