import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import type { Authenticator } from "@app/lib/auth";
import { floorToHourISO } from "@app/lib/metronome/client";
import {
  ensureMetronomeCustomerForWorkspace,
  provisionMetronomeContract,
} from "@app/lib/metronome/contracts";
import { FREE_PACKAGE_ALIAS } from "@app/lib/metronome/types";
import { PlanModel } from "@app/lib/models/plan";
import {
  CREDIT_PRICED_FREE_PLAN_CODE,
  FREE_TRIAL_PHONE_PLAN_CODE,
  isOldFreePlan,
} from "@app/lib/plans/plan_codes";
import {
  PHONE_TRIAL_ENABLED,
  TRIAL_DURATION_DAYS,
} from "@app/lib/plans/trial/constants";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";

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
 * Activates the new credit-priced Free Plan (CP_FREE_PLAN) for a workspace.
 *
 * Do NOT call this directly. Use the isMetronomeBillingEnabled gate in trial/start.ts.
 */
export async function activateCreditPricedFreePlan(
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const lightWorkspace = renderLightWorkspaceType({ workspace: owner });
  const now = new Date(floorToHourISO(new Date()));

  const customerResult = await ensureMetronomeCustomerForWorkspace({
    workspace: lightWorkspace,
  });
  if (customerResult.isErr()) {
    throw new Error(
      `Failed to ensure Metronome customer: ${customerResult.error.message}`
    );
  }
  const { metronomeCustomerId } = customerResult.value;

  const contractResult = await provisionMetronomeContract({
    metronomeCustomerId,
    workspace: lightWorkspace,
    packageAlias: FREE_PACKAGE_ALIAS,
    uniquenessKey: `cp-free-plan-${owner.sId}`,
    startingAt: now,
    swapAt: "current-hour",
    enableStripeBilling: false,
    planCode: CREDIT_PRICED_FREE_PLAN_CODE,
  });
  if (contractResult.isErr()) {
    throw new Error(
      `Failed to provision Metronome contract: ${contractResult.error.message}`
    );
  }
  const { metronomeContractId } = contractResult.value;

  const plan = await PlanModel.findOne({
    where: { code: CREDIT_PRICED_FREE_PLAN_CODE },
  });
  if (!plan) {
    throw new Error(
      `Plan row for ${CREDIT_PRICED_FREE_PLAN_CODE} not found in DB. ` +
        `Seed it in production before enabling Metronome billing.`
    );
  }

  const subscriptionResult =
    await SubscriptionResource.createSubscriptionFromCheckout({
      workspaceModelId: owner.id,
      plan,
      metronomeContractId,
      now,
    });
  if (subscriptionResult.isErr()) {
    throw new Error(
      `Failed to create subscription: ${subscriptionResult.error.message}`
    );
  }

  await restoreWorkspaceAfterSubscription(auth);
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
