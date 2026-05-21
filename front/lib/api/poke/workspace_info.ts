import config from "@app/lib/api/config";
import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import { getWorkspaceCreationDate } from "@app/lib/api/workspace";
import { type Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { getMetronomeCustomerStripeCustomerId } from "@app/lib/metronome/client";
import { getCustomerId, getStripeSubscription } from "@app/lib/plans/stripe";
import { ExtensionConfigurationResource } from "@app/lib/resources/extension";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import type { ExtensionConfigurationType } from "@app/types/extension";
import type { SubscriptionType } from "@app/types/plan";
import type { ProgrammaticUsageConfigurationType } from "@app/types/programmatic_usage";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { WHITELISTABLE_FEATURES } from "@app/types/shared/feature_flags";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceDomain } from "@app/types/workspace";
import { format } from "date-fns/format";
import type Stripe from "stripe";

// Narrow wire shape for the Stripe subscription embedded in PokeWorkspaceInfo.
// Stripe's full `Stripe.Subscription` is a deeply-nested type whose declared
// optional/`JSONValue` fields don't round-trip through Hono's typed JSON
// response inference, so we only expose the fields the Poke admin UI actually
// reads.
export type PokeStripeSubscriptionWire = {
  id: string;
  current_period_start: number;
  current_period_end: number;
};

export type PokeWorkspaceInfo = {
  activeSubscription: SubscriptionType;
  baseUrl: string;
  extensionConfig: ExtensionConfigurationType | null;
  hasDummyFeature: boolean;
  hasMetronomeFeature: boolean;
  membersCount: number;
  metronomeCustomerId: string | null;
  pendingSubscription: SubscriptionType | null;
  programmaticUsageConfig: ProgrammaticUsageConfigurationType | null;
  stripeCustomerId: string | null;
  stripeSubscription: PokeStripeSubscriptionWire | null;
  subscriptions: SubscriptionType[];
  whitelistableFeatures: WhitelistableFeature[];
  temporalFrontNamespace: string;
  workspaceCreationDay: string;
  workspaceVerifiedDomains: WorkspaceDomain[];
  workosEnvironmentId: string;
};

/**
 * Assembles the workspace-info payload shown in the poke admin UI: every
 * subscription, billing config (Stripe + Metronome with cross-lookup),
 * extension config, programmatic-usage config, feature flags, member count,
 * verified domains, and a few environment knobs. Returns an `Err` when the
 * workspace has no resolvable active subscription or its WorkspaceResource
 * row cannot be found.
 */
export async function getPokeWorkspaceInfo(
  auth: Authenticator
): Promise<Result<PokeWorkspaceInfo, "workspace_not_found">> {
  const owner = auth.getNonNullableWorkspace();
  const activeSubscription = auth.subscription();
  if (!activeSubscription) {
    return new Err("workspace_not_found");
  }

  const workspaceResource = await WorkspaceResource.fetchById(owner.sId);
  if (!workspaceResource) {
    return new Err("workspace_not_found");
  }

  const subscriptionResources =
    await SubscriptionResource.fetchByAuthenticator(auth);
  const subscriptions = subscriptionResources.map((s) => s.toJSON());

  const workspaceVerifiedDomains = await workspaceResource.getVerifiedDomains();
  const workspaceCreationDay = await getWorkspaceCreationDate(owner.sId);

  const extensionConfig =
    await ExtensionConfigurationResource.fetchForWorkspace(auth);

  const programmaticUsageConfig =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);

  const hasDummyFeature = await hasFeatureFlag(
    auth,
    "dummy_feature_for_flag_testing"
  );

  const hasMetronomeFeature = await isMetronomeBillingEnabled(auth);

  const pendingSubscriptionResource =
    await SubscriptionResource.fetchPendingByWorkspaceModelId(
      workspaceResource.id
    );
  const pendingSubscription = pendingSubscriptionResource?.toJSON() ?? null;

  const membersCount = await MembershipResource.getMembersCountForWorkspace({
    workspace: owner,
    activeOnly: true,
  });

  let stripeSubscription: Stripe.Subscription | null = null;
  if (activeSubscription.stripeSubscriptionId) {
    stripeSubscription = await getStripeSubscription(
      activeSubscription.stripeSubscriptionId
    );
  }

  let stripeCustomerId: string | null = null;
  if (stripeSubscription) {
    stripeCustomerId = getCustomerId(stripeSubscription);
  } else if (workspaceResource.metronomeCustomerId) {
    const lookup = await getMetronomeCustomerStripeCustomerId(
      workspaceResource.metronomeCustomerId
    );
    if (lookup.isOk()) {
      stripeCustomerId = lookup.value;
    } else {
      logger.warn(
        {
          workspaceId: owner.sId,
          metronomeCustomerId: workspaceResource.metronomeCustomerId,
          error: lookup.error.message,
        },
        "[Poke workspace-info] Failed to resolve Stripe customer ID from Metronome billing config"
      );
    }
  }

  return new Ok({
    activeSubscription,
    hasDummyFeature,
    hasMetronomeFeature,
    membersCount,
    metronomeCustomerId: workspaceResource.metronomeCustomerId ?? null,
    pendingSubscription,
    stripeCustomerId,
    stripeSubscription: stripeSubscription
      ? {
          id: stripeSubscription.id,
          current_period_start: stripeSubscription.current_period_start,
          current_period_end: stripeSubscription.current_period_end,
        }
      : null,
    subscriptions,
    whitelistableFeatures: WHITELISTABLE_FEATURES,
    workspaceVerifiedDomains,
    workspaceCreationDay: format(workspaceCreationDay, "yyyy-MM-dd"),
    extensionConfig: extensionConfig?.toJSON() ?? null,
    programmaticUsageConfig: programmaticUsageConfig?.toJSON() ?? null,
    baseUrl: config.getApiBaseUrl(),
    workosEnvironmentId: config.getWorkOSEnvironmentId(),
    temporalFrontNamespace: config.getTemporalFrontNamespace() ?? "",
  });
}
