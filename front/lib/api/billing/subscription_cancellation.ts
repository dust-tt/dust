import type { Authenticator } from "@app/lib/auth";
import {
  reactivateMetronomeContract,
  scheduleMetronomeContractEnd,
} from "@app/lib/metronome/client";
import {
  clearScheduledSubscriptionCancellation,
  scheduleSubscriptionCancellation,
} from "@app/lib/plans/stripe";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

type SubscriptionCancellationErrorKind =
  // Bad input or precondition not met (not Stripe-billed, no resolvable billing
  // period) — handler should return 400.
  | "invalid_state"
  // A Stripe/Metronome API call failed — handler should return 502.
  | "upstream_error";

export class SubscriptionCancellationError extends Error {
  constructor(
    readonly kind: SubscriptionCancellationErrorKind,
    message: string
  ) {
    super(message);
  }
}

/**
 * User-facing cancel of a Stripe-billed subscription at the end of its CURRENT
 * billing period: end the current Metronome shadow contract (if any) there too,
 * schedule the Stripe cancellation, and mark the local subscription as canceled
 * at that date. Reversible via `resumeWorkspaceSubscription` until the Stripe
 * subscription actually ends.
 */
export async function cancelWorkspaceSubscription(
  auth: Authenticator
): Promise<Result<{ endDate: Date }, SubscriptionCancellationError>> {
  const workspace = auth.getNonNullableWorkspace();
  const { metronomeCustomerId } = workspace;

  const subscription = auth.subscriptionResource();
  if (!subscription?.stripeSubscriptionId) {
    return new Err(
      new SubscriptionCancellationError(
        "invalid_state",
        "Workspace has no Stripe-billed subscription to cancel."
      )
    );
  }

  const pricing = await subscription.getPerSeatPricing();
  if (!pricing || pricing.currentPeriodEndMs === null) {
    return new Err(
      new SubscriptionCancellationError(
        "invalid_state",
        "Could not resolve the current billing period end."
      )
    );
  }

  const endDate = new Date(pricing.currentPeriodEndMs);

  // 1. Bring the current Metronome shadow contract's end forward to the current
  //    period end.
  if (subscription.metronomeContractId && metronomeCustomerId) {
    const endResult = await scheduleMetronomeContractEnd({
      metronomeCustomerId,
      contractId: subscription.metronomeContractId,
      endingBefore: endDate,
    });
    if (endResult.isErr()) {
      return new Err(
        new SubscriptionCancellationError(
          "upstream_error",
          `Failed to update the current contract end: ${endResult.error.message}.`
        )
      );
    }
  }

  // 2. Schedule the Stripe cancellation at the current period end.
  //    `scheduleSubscriptionCancellation` throws on a Stripe API failure.
  try {
    await scheduleSubscriptionCancellation({
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      cancelAt: endDate,
    });
  } catch (err) {
    return new Err(
      new SubscriptionCancellationError(
        "upstream_error",
        "Updated the current contract end, but failed to schedule the Stripe " +
          `cancellation: ${normalizeError(err).message}.`
      )
    );
  }

  // 3. Mark the local subscription as canceled at the current period end so the
  //    UI shows "ends on {date}".
  await subscription.markAsCanceled({ endDate });

  logger.info(
    {
      workspaceId: workspace.sId,
      billingPeriod: pricing.billingPeriod,
      endDate: endDate.toISOString(),
    },
    "[subscription-cancellation] Cancelled subscription; workspace churns at the cancellation date"
  );

  return new Ok({ endDate });
}

/**
 * Undo a `cancelWorkspaceSubscription`: clear the scheduled Stripe cancellation,
 * reactivate the current Metronome shadow contract (remove the end date the
 * cancel scheduled), and clear the local cancellation marker.
 *
 * Only valid until the Stripe subscription actually ends.
 */
export async function resumeWorkspaceSubscription(
  auth: Authenticator
): Promise<Result<undefined, SubscriptionCancellationError>> {
  const workspace = auth.getNonNullableWorkspace();

  const subscription = auth.subscriptionResource();
  if (!subscription?.stripeSubscriptionId) {
    return new Err(
      new SubscriptionCancellationError(
        "invalid_state",
        "Workspace has no Stripe-billed subscription to resume."
      )
    );
  }

  // 1. Remove the end date the cancel scheduled on the current shadow contract.
  if (subscription.metronomeContractId && workspace.metronomeCustomerId) {
    const reactivateResult = await reactivateMetronomeContract({
      metronomeCustomerId: workspace.metronomeCustomerId,
      contractId: subscription.metronomeContractId,
    });
    if (reactivateResult.isErr()) {
      return new Err(
        new SubscriptionCancellationError(
          "upstream_error",
          `Failed to restore the current contract: ${reactivateResult.error.message}.`
        )
      );
    }
  }

  // 2. Clear the scheduled Stripe cancellation so the subscription keeps running.
  const clearResult = await clearScheduledSubscriptionCancellation({
    stripeSubscriptionId: subscription.stripeSubscriptionId,
  });
  if (clearResult.isErr()) {
    return new Err(
      new SubscriptionCancellationError(
        "upstream_error",
        `Failed to clear the scheduled Stripe cancellation: ${clearResult.error.message}.`
      )
    );
  }

  // 3. Clear the local cancellation marker.
  await subscription.markAsCanceled({ endDate: null });

  logger.info(
    { workspaceId: workspace.sId },
    "[subscription-cancellation] Resumed subscription; scheduled cancellation cleared"
  );

  return new Ok(undefined);
}
