import type { Authenticator } from "@app/lib/auth";
import {
  archiveMetronomeContract,
  reactivateMetronomeContract,
} from "@app/lib/metronome/client";
import { clearScheduledSubscriptionCancellation } from "@app/lib/plans/stripe";
import { MembershipResource } from "@app/lib/resources/membership_resource";
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
 * The switch flow leaves these artifacts behind that this undoes:
 *   - a future-dated Metronome contract (the pending one) → archived;
 *   - a scheduled end on the current Metronome contract → end removed;
 *   - a scheduled cancellation on the current Stripe subscription → cleared;
 *   - scheduled membership seat-type remaps at the pending start → cancelled;
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

  // 0. Undo the seat remap staged for this switch. `provisionMetronomeContract`
  //    scheduled membership seat-type changes at the pending contract's start,
  //    so cancel exactly those (scoped to that moment, leaving unrelated
  //    scheduled changes intact). Reopens the memberships' current seat rows.
  //    Done first: it's a local, idempotent operation, safe to re-run if a
  //    later step fails and the operator retries.
  if (pending.startDate) {
    const cancelledRemapCount =
      await MembershipResource.cancelScheduledSeatChangesForWorkspaceAt({
        workspace: owner,
        scheduledAt: pending.startDate,
      });
    if (cancelledRemapCount > 0) {
      logger.info(
        {
          workspaceId: owner.sId,
          scheduledAt: pending.startDate.toISOString(),
          cancelledRemapCount,
        },
        "[cancel_pending_contract] Cancelled scheduled seat remap"
      );
    }
  }

  // 1. Archive the pending Metronome contract first. Metronome rejects clearing
  //    the end date on the current contract (step 2) while its RENEWAL successor
  //    has finalized invoices (e.g. prepaid commit invoices created at switch
  //    time). Archiving with voidInvoices:true removes those invoices, lifting
  //    the restriction on the current contract. Done before step 2 so that
  //    step 2 can succeed.
  const pendingContractId = pending.metronomeContractId;
  if (pendingContractId && metronomeCustomerId) {
    const archiveResult = await archiveMetronomeContract({
      metronomeCustomerId,
      contractId: pendingContractId,
    });
    if (archiveResult.isErr()) {
      return new Err(
        new CancelPendingContractError(
          "restore_failed",
          `Failed to archive the pending Metronome contract ${pendingContractId}: ` +
            `${archiveResult.error.message}. No changes were applied.`
        )
      );
    }
  }

  // 2. Restore the current Metronome contract: remove the scheduled end that
  //    switch_contract set up so it no longer lapses at the swap time.
  if (currentSubscription?.metronomeContractId && metronomeCustomerId) {
    const reactivateResult = await reactivateMetronomeContract({
      metronomeCustomerId,
      contractId: currentSubscription.metronomeContractId,
    });
    if (reactivateResult.isErr()) {
      return new Err(
        new CancelPendingContractError(
          "cleanup_inconsistent",
          "Archived the pending Metronome contract but failed to restore the " +
            `current contract ${currentSubscription.metronomeContractId}: ` +
            `${reactivateResult.error.message}. ` +
            "URGENT: manually remove the end date from the current contract."
        )
      );
    }
  }

  // 3. Restore the current Stripe subscription: clear the scheduled
  //    cancellation so it keeps running.
  if (currentSubscription?.stripeSubscriptionId) {
    const clearResult = await clearScheduledSubscriptionCancellation({
      stripeSubscriptionId: currentSubscription.stripeSubscriptionId,
    });
    if (clearResult.isErr()) {
      return new Err(
        new CancelPendingContractError(
          "cleanup_inconsistent",
          "Archived the pending contract and restored the current Metronome " +
            "contract, but failed to clear the scheduled cancellation on " +
            `Stripe subscription ${currentSubscription.stripeSubscriptionId}: ` +
            `${clearResult.error.message}. ` +
            "URGENT: clear cancel_at on the Stripe subscription manually."
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
