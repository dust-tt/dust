import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  FREE_TRIAL_PHONE_PLAN_CODE,
  isOldFreePlan,
} from "@app/lib/plans/plan_codes";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";

const TRIAL_DURATION_DAYS = 30;

// TODO: Replace with actual verification service.
const VALID_TEST_CODE = "424242";

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
 * Verifies the phone verification code.
 * TODO: Replace with actual SMS verification service.
 */
export function isValidVerificationCode(code: string): boolean {
  return code === VALID_TEST_CODE;
}

/**
 * Activates the phone trial subscription for a workspace.
 * Creates a subscription with FREE_TRIAL_PHONE_PLAN_CODE and a 30-day end date.
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
