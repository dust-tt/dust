import type { Authenticator } from "@app/lib/auth";
import {
  archiveMetronomeContract,
  reactivateMetronomeContract,
} from "@app/lib/metronome/client";
import { clearScheduledSubscriptionCancellation } from "@app/lib/plans/stripe";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type CancelPendingContractErrorKind =
  // Bad input or precondition not met — handler should return 400.
  | "invalid_request"
  // Metronome (or Stripe) API failure while restoring the current contract,
  // before any irreversible local change.
  | "restore_failed"
  // The current contract/sub was restored but a follow-up step (archive the
  // pending contract, delete the pending subscription) failed. Manual cleanup
  // may be required; the message documents what's left to undo.
  | "cleanup_inconsistent";

export class CancelPendingContractError extends Error {
  constructor(
    readonly kind: CancelPendingContractErrorKind,
    message: string
  ) {
    super(message);
  }
}

export type CancelPendingContractSuccess = {
  cancelledMetronomeContractId: string | null;
};

/**
 * Cancel a pending contract switch staged by `switchContract`, reverting the
 * workspace to its current contract.
 *
 * The switch flow leaves three artifacts behind that this undoes:
 *   - a future-dated Metronome contract (the pending one) → archived;
 *   - a scheduled end on the current Metronome contract → end removed;
 *   - a scheduled cancellation on the current Stripe subscription → cleared;
 * plus the pending `created_backend_only` subscription row → deleted.
 *
 * The current contract/sub are restored FIRST so that a later failure can
 * never leave the workspace billing-less (it would only leave an orphaned
 * pending contract, which the operator can retry to archive).
 */
export async function cancelPendingContract({
  auth,
}: {
  auth: Authenticator;
}): Promise<Result<CancelPendingContractSuccess, CancelPendingContractError>> {
  const owner = auth.getNonNullableWorkspace();
  const { metronomeCustomerId } = owner;

  const pending = await SubscriptionResource.fetchPendingByWorkspaceModelId(
    owner.id
  );
  if (!pending) {
    return new Err(
      new CancelPendingContractError(
        "invalid_request",
        "No pending subscription to cancel for this workspace."
      )
    );
  }

  const currentSubscription = auth.subscriptionResource();

  // 1. Restore the current Metronome contract: remove the scheduled end that
  //    switch_contract set up so it no longer lapses at the swap time.
  if (currentSubscription?.metronomeContractId && metronomeCustomerId) {
    const reactivateResult = await reactivateMetronomeContract({
      metronomeCustomerId,
      contractId: currentSubscription.metronomeContractId,
    });
    if (reactivateResult.isErr()) {
      return new Err(
        new CancelPendingContractError(
          "restore_failed",
          "Failed to restore the current Metronome contract " +
            `${currentSubscription.metronomeContractId}: ` +
            `${reactivateResult.error.message}. No changes were applied.`
        )
      );
    }
  }

  // 2. Restore the current Stripe subscription: clear the scheduled
  //    cancellation so it keeps running.
  if (currentSubscription?.stripeSubscriptionId) {
    const clearResult = await clearScheduledSubscriptionCancellation({
      stripeSubscriptionId: currentSubscription.stripeSubscriptionId,
    });
    if (clearResult.isErr()) {
      return new Err(
        new CancelPendingContractError(
          "restore_failed",
          "Restored the current Metronome contract but failed to clear the " +
            `scheduled cancellation on Stripe subscription ` +
            `${currentSubscription.stripeSubscriptionId}: ` +
            `${clearResult.error.message}. ` +
            "URGENT: clear cancel_at on the Stripe subscription manually."
        )
      );
    }
  }

  // 3. Archive the pending Metronome contract (it has not started yet).
  const pendingContractId = pending.metronomeContractId;
  if (pendingContractId && metronomeCustomerId) {
    const archiveResult = await archiveMetronomeContract({
      metronomeCustomerId,
      contractId: pendingContractId,
    });
    if (archiveResult.isErr()) {
      return new Err(
        new CancelPendingContractError(
          "cleanup_inconsistent",
          "Restored the current contract/subscription but failed to archive " +
            `the pending Metronome contract ${pendingContractId}: ` +
            `${archiveResult.error.message}. Archive it manually, then delete ` +
            "the pending subscription."
        )
      );
    }
  }

  // 4. Delete the pending subscription row.
  const deleteResult = await pending.delete(auth);
  if (deleteResult.isErr()) {
    return new Err(
      new CancelPendingContractError(
        "cleanup_inconsistent",
        "Restored the current contract and archived the pending Metronome " +
          "contract, but failed to delete the pending subscription: " +
          `${deleteResult.error.message}. Delete the pending subscription ` +
          "row manually."
      )
    );
  }

  logger.info(
    {
      workspaceId: owner.sId,
      pendingContractId,
      restoredContractId: currentSubscription?.metronomeContractId ?? null,
      restoredStripeSubscriptionId:
        currentSubscription?.stripeSubscriptionId ?? null,
    },
    "[cancel_pending_contract] Cancelled pending contract switch"
  );

  return new Ok({ cancelledMetronomeContractId: pendingContractId });
}
