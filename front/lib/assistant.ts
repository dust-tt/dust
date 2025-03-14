import type { AgentModelConfigurationType } from "@app/types";
import type { SupportedModel } from "@app/types";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types";

export function isLargeModel(model: unknown): model is SupportedModel {
  const maybeSupportedModel = model as SupportedModel;
  const m = SUPPORTED_MODEL_CONFIGS.find(
    (m) =>
      m.modelId === maybeSupportedModel.modelId &&
      m.providerId === maybeSupportedModel.providerId
  );
  if (m) {
    return m.largeModel;
  }
  return false;
}

export function getSupportedModelConfig(
  supportedModel: SupportedModel | AgentModelConfigurationType
) {
  // here it is safe to cast the result to non-nullable because SupportedModel
  // is derived from the const array of configs above
  return SUPPORTED_MODEL_CONFIGS.find(
    (m) =>
      m.modelId === supportedModel.modelId &&
      m.providerId === supportedModel.providerId &&
      m.reasoningEffort === supportedModel.reasoningEffort
  ) as (typeof SUPPORTED_MODEL_CONFIGS)[number];
}
