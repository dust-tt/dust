import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { isOldFreePlan } from "@app/lib/plans/plan_codes";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";

/**
 * Checks if a workspace is eligible for the trial page.
 * A workspace is eligible if:
 * - It has the "phone_trial_paywall" feature flag enabled.
 * - It has never had another subscription before.
 */
export async function isWorkspaceEligibleForTrial(
  auth: Authenticator
): Promise<boolean> {
  const owner = auth.getNonNullableWorkspace();

  // If you're not admin it means the workspace had a subscription before.
  // so no need to check further.
  if (!auth.isAdmin()) {
    return false;
  }

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("phone_trial_paywall")) {
    return false;
  }

  const fetched = await SubscriptionResource.fetchByAuthenticator(auth);
  const subscriptions = fetched.map((s) => s.toJSON());

  // Current plan is either FREE_NO_PLAN or FREE_TEST_PLAN if you're on this paywall.
  // FREE_NO_PLAN is not on the database, checking it comes down to having at least 1 subscription.
  const noPreviousSubscription =
    subscriptions.length === 0 ||
    (subscriptions.length === 1 && isOldFreePlan(subscriptions[0].plan.code));

  if (!noPreviousSubscription) {
    return false;
  }

  return true;
}
