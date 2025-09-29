import { isUpgraded } from "@app/lib/plans/plan_codes";
import type {
  AgentModelConfigurationType,
  ModelConfigurationType,
  PlanType,
  SupportedModel,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";
import { isProviderWhitelisted, SUPPORTED_MODEL_CONFIGS } from "@app/types";

function isLargeModel(model: unknown): model is SupportedModel {
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

  return isProviderWhitelisted(owner, m.providerId);
}
