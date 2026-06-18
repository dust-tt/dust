import config from "@app/lib/api/config";
import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import { getWorkspaceCreationDate } from "@app/lib/api/workspace";
import { type Authenticator, hasFeatureFlag } from "@app/lib/auth";
import type { DefaultMetronomeAlerts } from "@app/lib/metronome/alerts/default_alerts";
import type { MetronomeAlertRef } from "@app/lib/metronome/alerts/types";
import { getCachedWorkspaceMetronomeAlerts } from "@app/lib/metronome/alerts/workspace_alerts";
import { getMetronomeCustomerStripeCustomerId } from "@app/lib/metronome/client";
import { isWorkspaceProgrammaticWarningReached } from "@app/lib/metronome/user_block";
import { getCustomerId, getStripeSubscription } from "@app/lib/plans/stripe";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { ExtensionConfigurationResource } from "@app/lib/resources/extension";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import type {
  WorkspacePoolCreditState,
  WorkspaceProgrammaticCreditState,
} from "@app/types/credits";
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

export type PokeCreditUsageConfig = ReturnType<
  CreditUsageConfigurationResource["toJSON"]
>;

// The four programmatic alerts (cap / 80% warning / low / critical) — id and
// current status — for deep-linking and display from Poke. Null per slot when
// that alert isn't configured.
export type PokeProgrammaticAlerts = {
  cap: MetronomeAlertRef | null;
  warning: MetronomeAlertRef | null;
  low: MetronomeAlertRef | null;
  critical: MetronomeAlertRef | null;
};

export type PokeWorkspaceInfo = {
  activeSubscription: SubscriptionType;
  baseUrl: string;
  creditUsageConfig: PokeCreditUsageConfig | null;
  extensionConfig: ExtensionConfigurationType | null;
  hasDummyFeature: boolean;
  hasMetronomeFeature: boolean;
  membersCount: number;
  metronomeCustomerId: string | null;
  pendingSubscription: SubscriptionType | null;
  poolCreditState: WorkspacePoolCreditState;
  // The Metronome alerts backing each credit dimension — id and current status —
  // for deep-linking and display from Poke. Null when not configured / not
  // Metronome-billed.
  poolAlert: MetronomeAlertRef | null;
  programmaticAlerts: PokeProgrammaticAlerts;
  usageCapAlert: MetronomeAlertRef | null;
  // Account-wide default alerts (pool empty/low/critical, seat empty/low),
  // created by the Metronome setup script and shared across all customers.
  defaultAlerts: DefaultMetronomeAlerts;
  programmaticCreditState: WorkspaceProgrammaticCreditState;
  programmaticWarningReached: boolean;
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

export type PokeGetWorkspaceInfo = PokeWorkspaceInfo;

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

  const creditUsageConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

  // Resolve the Metronome alert ids backing each credit dimension so Poke can
  // deep-link to the dashboard. Best-effort: any failure degrades to null
  // rather than breaking the workspace-info page.
  const { metronomeCustomerId } = workspaceResource;
  let poolAlert: MetronomeAlertRef | null = null;
  let programmaticAlerts: PokeProgrammaticAlerts = {
    cap: null,
    warning: null,
    low: null,
    critical: null,
  };
  let usageCapAlert: MetronomeAlertRef | null = null;
  let defaultAlerts: DefaultMetronomeAlerts = {
    poolEmpty: null,
    poolLow: null,
    poolCritical: null,
    seatEmpty: null,
    seatLowMax: null,
    seatLowPro: null,
  };
  if (metronomeCustomerId) {
    // One Redis-cached alert-list scan resolves every alert below, instead of a
    // separate Metronome lookup per dimension.
    const alerts = await getCachedWorkspaceMetronomeAlerts({
      metronomeCustomerId,
      workspaceId: owner.sId,
    }).catch(() => null);
    if (alerts) {
      poolAlert = alerts.poolBalance;
      programmaticAlerts = alerts.programmatic;
      usageCapAlert = alerts.usageCap;
      defaultAlerts = alerts.default;
    }
  }

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
    poolCreditState: workspaceResource.poolCreditState,
    poolAlert,
    programmaticAlerts,
    usageCapAlert,
    defaultAlerts,
    programmaticCreditState: workspaceResource.programmaticCreditState,
    programmaticWarningReached: await isWorkspaceProgrammaticWarningReached(
      owner.sId
    ),
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
    creditUsageConfig: creditUsageConfig?.toJSON() ?? null,
    programmaticUsageConfig: programmaticUsageConfig?.toJSON() ?? null,
    baseUrl: config.getApiBaseUrl(),
    workosEnvironmentId: config.getWorkOSEnvironmentId(),
    temporalFrontNamespace: config.getTemporalFrontNamespace() ?? "",
  });
}
