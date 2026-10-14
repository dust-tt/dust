import { isModelWhitelisted } from "@app/lib/api/assistant/provider_whitelist";
import {
  isCreditPricedPlanPrefix,
  isUpgraded,
} from "@app/lib/plans/plan_codes";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import { isStaticModelId } from "@app/types/assistant/models/models";
import { isByokProviderId } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  WhitelistableModelMakerIdType,
} from "@app/types/assistant/models/types";
import { GATEWAY_MODEL_IDS } from "@app/types/gateways/models";
import type { PlanType } from "@app/types/plan";
import type { RegionType } from "@app/types/region";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

// False if the model requires an on-demand/dust-only feature flag (not GA).
// `premium_model_access` is not one: it waives a paid entitlement on a model
// that is already released, so it must not hide the model from the GA list.
export function isModelReleased(m: ModelConfigurationType): boolean {
  const { featureFlag } = m.availableIfOneOf ?? {};

  return featureFlag === undefined || featureFlag === "premium_model_access";
}

function checkModelSpecificAccessRules(
  modelConfiguration: ModelConfigurationType,
  {
    featureFlags,
    plan,
  }: {
    featureFlags: WhitelistableFeature[];
    plan: PlanType | null;
  }
): boolean {
  const { availableIfOneOf, largeModel, unavailableIfOneOf } =
    modelConfiguration;

  // Opt-out check: matching a model-specific unavailability rule vetoes every
  // grant below.
  if (unavailableIfOneOf) {
    const { featureFlag } = unavailableIfOneOf;

    const matchesFeatureFlagCondition =
      featureFlag !== undefined && featureFlags.includes(featureFlag);

    if (matchesFeatureFlagCondition) {
      return false;
    }
  }

  // First check: downgraded plans only have access to the small models.
  if (largeModel && !isUpgraded(plan)) {
    return false;
  }

  // Second check: if we have a model-specific override rule, we honor it.
  if (availableIfOneOf) {
    const { creditPricedPlan, plansWithAdvancedModels, featureFlag } =
      availableIfOneOf;

    const passesCreditPlanCondition =
      creditPricedPlan === true &&
      plan !== null &&
      isCreditPricedPlanPrefix(plan.code);

    const passesAdvancedModelCondition =
      plansWithAdvancedModels === true && plan?.hasAdvancedModelAccess === true;

    const passesFeatureFlagCondition =
      featureFlag !== undefined && featureFlags.includes(featureFlag);

    return (
      passesCreditPlanCondition ||
      passesAdvancedModelCondition ||
      passesFeatureFlagCondition
    );
  }

  // If there's no override and no downgraded-plan restriction, the model is allowed.
  return true;
}

/**
 * @cc [owner:Nils-Fedrigo,label:product;security] byok-streams-available
 * On a BYOK plan, a routing stream (auto, auto_fast, auto_complex) MUST NOT be reported unavailable
 * because of its provider id; any other model whose provider is not a BYOK provider MUST be.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:product] unavailable-feature-flag-vetoes-availability
 * A model must be reported unavailable whenever it satisfies one of its
 * `unavailableIfOneOf` conditions, whatever `availableIfOneOf`, `plan`, `region` or
 * `regionalModelsOnly` would otherwise grant.
 */
/**
 * @cc [owner:pmilliotte,label:product;security] gateway-plans-see-gateway-models-only
 * On a plan with a `gateway`, a model MUST be reported unavailable unless it is listed in
 * `GATEWAY_MODEL_IDS` for that gateway, routing streams (auto, auto_fast, auto_complex) included.
 */
// Returns true if the model is available to the workspace for build.
export function isModelAvailable(
  m: ModelConfigurationType,
  {
    featureFlags,
    plan,
    regionalModelsOnly,
    region,
  }: {
    featureFlags: WhitelistableFeature[];
    plan: PlanType | null;
    regionalModelsOnly: boolean;
    region: RegionType;
  }
) {
  const hasAccess = checkModelSpecificAccessRules(m, {
    featureFlags,
    plan,
  });

  if (!hasAccess) {
    return false;
  }

  if (plan?.gateway && !GATEWAY_MODEL_IDS[plan.gateway].includes(m.modelId)) {
    return false;
  }

  // Streams are not served by any provider: they resolve at message time to a
  // concrete model, which goes through these same checks.
  if (
    plan?.isByok &&
    !isByokProviderId(m.providerId) &&
    !isModelStreamId(m.providerId)
  ) {
    return false;
  }

  // EAP models are served from Dust's own Anthropic EAP organization, on Dust's key.
  if (plan?.isByok && m.useEapKey) {
    return false;
  }

  // Custom models are test models served on Dust's keys, whichever one they use.
  if (plan?.isByok && !isStaticModelId(m.modelId)) {
    return false;
  }

  if (regionalModelsOnly && m.regionalAvailability[region] !== true) {
    return false;
  }

  return true;
}

// Returns true if the model is enabled for the workspace.
export function isModelEnabled(
  m: ModelConfigurationType,
  {
    featureFlags,
    plan,
    regionalModelsOnly,
    region,
    whitelistedProviders,
  }: {
    featureFlags: WhitelistableFeature[];
    plan: PlanType | null;
    regionalModelsOnly: boolean;
    region: RegionType;
    whitelistedProviders: ReadonlySet<WhitelistableModelMakerIdType>;
  }
) {
  return (
    isModelAvailable(m, { featureFlags, plan, regionalModelsOnly, region }) &&
    isModelWhitelisted(whitelistedProviders, m)
  );
}

export function filterEnabledModels(
  models: ModelConfigurationType[],
  {
    featureFlags,
    plan,
    regionalModelsOnly,
    region,
    whitelistedProviders,
  }: {
    featureFlags: WhitelistableFeature[];
    plan: PlanType | null;
    regionalModelsOnly: boolean;
    region: RegionType;
    whitelistedProviders: ReadonlySet<WhitelistableModelMakerIdType>;
  }
): ModelConfigurationType[] {
  return models.filter((m) =>
    isModelEnabled(m, {
      featureFlags,
      plan,
      regionalModelsOnly,
      region,
      whitelistedProviders,
    })
  );
}
