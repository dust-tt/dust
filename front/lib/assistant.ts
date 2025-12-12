import { config as regionConfig } from "@app/lib/api/regions/config";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import type {
  AgentModelConfigurationType,
  ModelConfigurationType,
  PlanType,
  SupportedModel,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";
import {
  GPT_5_2_MODEL_ID,
  isProviderWhitelisted,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types";

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
      m.providerId === supportedModel.providerId
  ) as (typeof SUPPORTED_MODEL_CONFIGS)[number];
}

export function canUseModel(
  m: ModelConfigurationType,
  featureFlags: WhitelistableFeature[],
  plan: PlanType | null,
  owner: WorkspaceType
) {
  if (m.featureFlag && !featureFlags.includes(m.featureFlag)) {
    return false;
  }

  if (
    m.customAssistantFeatureFlag &&
    !featureFlags.includes(m.customAssistantFeatureFlag)
  ) {
    return false;
  }

  if (m.largeModel && !isUpgraded(plan)) {
    return false;
  }

  // GPT 5.2 is not available in EU region
  if (
    m.modelId === GPT_5_2_MODEL_ID &&
    regionConfig.getCurrentRegion() === "europe-west1"
  ) {
    return false;
  }

  return isProviderWhitelisted(owner, m.providerId);
}
