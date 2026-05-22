import type { Authenticator } from "@app/lib/auth";
import { isByokTransitioningPlan } from "@app/lib/plans/plan_codes";
import {
  BYOK_MODEL_PROVIDER_IDS,
  MODEL_PROVIDER_IDS,
} from "@app/types/assistant/models/providers";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";

export function getWhitelistedProviders(
  auth: Authenticator
): Set<ModelProviderIdType> {
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.getNonNullablePlan();
  const whiteListedProviders = new Set<ModelProviderIdType>(
    owner.whiteListedProviders ?? MODEL_PROVIDER_IDS
  );

  // noop never sees user data, always whitelisted.
  whiteListedProviders.add("noop");

  if (!plan.isByok) {
    return whiteListedProviders;
  }

  // For BYOK_TRANSITIONING workspaces, we fall back on Dust-managed keys for BYOK providers when
  // the customer hasn't configured their own. Whitelist all BYOK providers so they remain available
  // even if not yet configured.
  if (isByokTransitioningPlan(plan)) {
    const allByokProviderIds = new Set<ModelProviderIdType>(
      BYOK_MODEL_PROVIDER_IDS
    );
    allByokProviderIds.add("noop");

    return allByokProviderIds;
  }

  const providersHealth = auth.providersHealth();

  const configuredProviders = new Set(
    Object.keys(providersHealth ?? {}) as ModelProviderIdType[]
  );

  // noop never needs credentials.
  configuredProviders.add("noop");

  return whiteListedProviders.intersection(configuredProviders);
}

export function isProviderWhitelisted(
  auth: Authenticator,
  providerId: ModelProviderIdType
): boolean {
  const whitelistedProviders = getWhitelistedProviders(auth);
  return whitelistedProviders.has(providerId);
}
