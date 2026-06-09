import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { floorToHourISO } from "@app/lib/metronome/client";
import {
  ensureMetronomeCustomerForWorkspace,
  provisionMetronomeContract,
} from "@app/lib/metronome/contracts";
import {
  createCouponCredit,
  getCreditTypeFromPackage,
} from "@app/lib/metronome/coupons";
import { loadFirstPeriodCredit } from "@app/lib/metronome/credits";
import { PlanModel } from "@app/lib/models/plan";
import { resolvePackageAliasForCurrency } from "@app/lib/plans/billing_currency";
import type { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import type { CouponResource } from "@app/lib/resources/coupon_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { launchWorkOSWorkspaceSubscriptionCreatedWorkflow } from "@app/temporal/workos_events_queue/client";
import { isSupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Provisions a Metronome subscription after the first-period payment has been collected.
 * Sets the payment method as the customer's Stripe default, creates/ensures the Metronome
 * customer and contract, loads a first-period credit to zero out the first Metronome
 * invoice, creates the DB subscription, and restores the workspace.
 */
export async function provisionMetronomeFirstPeriodSubscription({
  stripeCustomerId,
  currency,
  workspaceId,
  userId,
  planCode,
  metronomePackageAlias,
  coupon,
  pendingRedemption,
  firstPeriodPaymentEnforced,
  firstPeriodPaymentCents,
  uniquenessKey,
  now,
}: {
  stripeCustomerId: string;
  currency: string;
  workspaceId: string;
  userId: string;
  planCode: string;
  metronomePackageAlias: string;
  coupon?: CouponResource;
  pendingRedemption?: CouponRedemptionResource;
  firstPeriodPaymentEnforced: boolean;
  firstPeriodPaymentCents: number;
  uniquenessKey: string;
  now: Date;
}): Promise<Result<void, DustError>> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    return new Err(
      new DustError(
        "workspace_not_found",
        `Workspace ${workspaceId} not found for Metronome setup session.`
      )
    );
  }

  logger.info(
    {
      uniquenessKey,
      workspaceId,
      planCode,
      userId,
      metronomePackageAlias,
      stripeCustomerId,
    },
    "[Metronome] Handle metronome checkout"
  );

  const validCurrency = isSupportedCurrency(currency) ? currency : "usd";
  const resolvedPackageAlias = resolvePackageAliasForCurrency(
    metronomePackageAlias,
    validCurrency
  );

  const plan = await PlanModel.findOne({ where: { code: planCode } });
  if (!plan) {
    return new Err(
      new DustError("plan_not_found", `Plan ${planCode} not found.`)
    );
  }

  const lightWorkspace = renderLightWorkspaceType({ workspace });

  const customerResult = await ensureMetronomeCustomerForWorkspace({
    workspace: lightWorkspace,
    stripeCustomerId,
  });
  if (customerResult.isErr()) {
    return new Err(
      new DustError("metronome_error", customerResult.error.message)
    );
  }
  const { metronomeCustomerId } = customerResult.value;

  if (coupon && pendingRedemption) {
    const creditTypeResult =
      await getCreditTypeFromPackage(resolvedPackageAlias);
    if (creditTypeResult.isErr()) {
      logger.error(
        {
          workspaceId,
          couponCode: coupon.code,
          redemptionId: pendingRedemption.sId,
          error: normalizeError(creditTypeResult.error).message,
        },
        "[Checkout] Failed to get credit type for coupon in Metronome checkout"
      );
      return new Err(
        new DustError("metronome_error", creditTypeResult.error.message)
      );
    }
    const { creditTypeId, currency: couponCurrency } = creditTypeResult.value;
    const creditResult = await createCouponCredit({
      metronomeCustomerId,
      coupon,
      redemptionId: pendingRedemption.sId,
      redeemedAt: pendingRedemption.redeemedAt,
      creditTypeId,
      currency: couponCurrency,
    });
    if (creditResult.isErr()) {
      logger.error(
        {
          workspaceId,
          couponCode: coupon.code,
          redemptionId: pendingRedemption.sId,
          error: normalizeError(creditResult.error).message,
        },
        "[Checkout] Failed to create coupon credit in Metronome checkout"
      );
      return new Err(
        new DustError("metronome_error", creditResult.error.message)
      );
    }
    const markActiveResult = await pendingRedemption.markActive(
      creditResult.value
    );
    if (markActiveResult.isErr()) {
      logger.error(
        {
          workspaceId,
          couponCode: coupon.code,
          redemptionId: pendingRedemption.sId,
          error: normalizeError(markActiveResult.error).message,
        },
        "[Checkout] Failed to mark coupon redemption as active"
      );
      return new Err(
        new DustError("metronome_error", markActiveResult.error.message)
      );
    }
  }

  if (
    firstPeriodPaymentEnforced &&
    firstPeriodPaymentCents &&
    firstPeriodPaymentCents > 0
  ) {
    // Zero out the first Metronome-generated invoice. The customer already paid
    // via the Stripe invoice. firstPeriodPaymentCents is pre-tax — exactly the amount that
    // Metronome will generate for the first period.
    const creditResult = await loadFirstPeriodCredit({
      metronomeCustomerId,
      amountCents: firstPeriodPaymentCents,
      currency: validCurrency,
      uniquenessKey,
      now,
    });
    if (creditResult.isErr()) {
      return new Err(
        new DustError("metronome_error", creditResult.error.message)
      );
    }
  }

  const contractResult = await provisionMetronomeContract({
    metronomeCustomerId,
    workspace: lightWorkspace,
    packageAlias: resolvedPackageAlias,
    uniquenessKey,
    startingAt: new Date(floorToHourISO(now)),
    planCode,
  });
  if (contractResult.isErr()) {
    return new Err(
      new DustError("metronome_error", contractResult.error.message)
    );
  }
  const { metronomeContractId } = contractResult.value;

  const subscriptionResult =
    await SubscriptionResource.createSubscriptionFromCheckout({
      workspaceModelId: workspace.id,
      plan,
      metronomeContractId,
      now,
    });
  if (subscriptionResult.isErr()) {
    return subscriptionResult;
  }

  const workspaceSeats = await MembershipResource.countActiveSeatsInWorkspace(
    workspace.sId
  );
  await ServerSideTracking.trackSubscriptionCreated({
    workspace: lightWorkspace,
    planCode,
    workspaceSeats,
    subscriptionStartAt: now,
  });

  const authAdmin = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  await restoreWorkspaceAfterSubscription(authAdmin);
  const workosWorkflowResult =
    await launchWorkOSWorkspaceSubscriptionCreatedWorkflow({ workspaceId });
  if (workosWorkflowResult.isErr()) {
    logger.error(
      {
        panic: true,
        workspaceId,
        error: normalizeError(workosWorkflowResult.error).message,
      },
      "[Checkout] Failed to launch WorkOS workspace subscription created workflow"
    );
  }

  logger.info(
    { workspaceId, metronomeContractId, uniquenessKey },
    "[Metronome] Checkout completed"
  );

  return new Ok(undefined);
}
