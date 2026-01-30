import type { Authenticator } from "@app/lib/auth";
import {
  FREE_TRIAL_PHONE_PLAN_CODE,
  isOldFreePlan,
} from "@app/lib/plans/plan_codes";
import {
  PHONE_TRIAL_ENABLED,
  TRIAL_DURATION_DAYS,
} from "@app/lib/plans/trial/constants";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";

/**
 * Checks if a workspace is eligible for the trial page.
 * A workspace is eligible if:
 * - Phone trial is enabled via PHONE_TRIAL_ENABLED constant.
 * - The user is an admin.
 * - The workspace has never had another subscription before.
 */
export async function isWorkspaceEligibleForTrial(
  auth: Authenticator
): Promise<boolean> {
  if (!PHONE_TRIAL_ENABLED) {
    return false;
  }

  // If you're not admin it means the workspace had a subscription before.
  // so no need to check further.
  if (!auth.isAdmin()) {
    return false;
  }

  const fetched = await SubscriptionResource.fetchByAuthenticator(auth);
  const subscriptions = fetched.map((s) => s.toJSON());

  // Current plan is either FREE_NO_PLAN or FREE_TEST_PLAN if you're on this paywall.
  // FREE_NO_PLAN is not on the database, checking it comes down to having at least 1 subscription.
  // Note that we treat users of the old free plan (FREE_TEST_PLAN) as eligible for a new trial.
  const noPreviousSubscription =
    subscriptions.length === 0 ||
    (subscriptions.length === 1 && isOldFreePlan(subscriptions[0].plan.code));

  if (!noPreviousSubscription) {
    return false;
  }

  return true;
}

/**
 * Activates the phone trial subscription for a workspace.
 * Creates a subscription with FREE_TRIAL_PHONE_PLAN_CODE and a 15-day end date.
 */
export async function activatePhoneTrial(auth: Authenticator): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + TRIAL_DURATION_DAYS);

  await SubscriptionResource.internalSubscribeWorkspaceToFreePlan({
    workspaceId: owner.sId,
    planCode: FREE_TRIAL_PHONE_PLAN_CODE,
    endDate,
  });
}
