import type { ModelConfigurationType } from "@app/types";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";

// Providers that have LLM implementations
const IMPLEMENTED_PROVIDERS = ["mistral"] as const;

export type ImplementedProviderId = (typeof IMPLEMENTED_PROVIDERS)[number];

export function isProviderImplemented(
  providerId: string
): providerId is ImplementedProviderId {
  return IMPLEMENTED_PROVIDERS.includes(providerId as ImplementedProviderId);
}

export function getAvailableModels(): ModelConfigurationType[] {
  return SUPPORTED_MODEL_CONFIGS.filter((model) =>
    isProviderImplemented(model.providerId)
  );
}

export function getModelsByProvider(): Record<
  ImplementedProviderId,
  ModelConfigurationType[]
> {
  const modelsByProvider: Record<string, ModelConfigurationType[]> = {};

  for (const model of getAvailableModels()) {
    if (!modelsByProvider[model.providerId]) {
      modelsByProvider[model.providerId] = [];
    }
    modelsByProvider[model.providerId].push(model);
  }

  return modelsByProvider as Record<
    ImplementedProviderId,
    ModelConfigurationType[]
  >;
}

export function getModelConfig(
  modelId: string
): ModelConfigurationType | undefined {
  return getAvailableModels().find((m) => m.modelId === modelId);
}

