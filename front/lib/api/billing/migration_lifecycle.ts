import {
  loadMigrationDeps,
  migrateWorkspaceToBusiness,
} from "@app/lib/api/billing/migrate_to_business";
import type { Authenticator } from "@app/lib/auth";
import {
  archiveMetronomeContract,
  reactivateMetronomeContract,
  scheduleMetronomeContractEnd,
} from "@app/lib/metronome/client";
import { scheduleSubscriptionCancellation } from "@app/lib/plans/stripe";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// Read model for the workspace's scheduled legacy → Business migration.
export type WorkspaceMigrationStatus = {
  // ISO date the pending migration will activate, or null when there is no
  // pending migration (never scheduled, or cancelled).
  pendingMigrationDate: string | null;
};

export type MigrationLifecycleErrorKind =
  // Bad input or precondition not met (no pending migration, not Stripe-billed,
  // no resolvable billing period) — handler should return 400.
  | "invalid_state"
  // A Stripe/Metronome API call failed — handler should return 502.
  | "upstream_error";

export class MigrationLifecycleError extends Error {
  constructor(
    readonly kind: MigrationLifecycleErrorKind,
    message: string
  ) {
    super(message);
  }
}

/**
 * User-facing cancel of a legacy Pro subscription at the end of its CURRENT
 * billing period. Works whether or not a migration is scheduled:
 *  - always: move the Stripe cancellation to the current period end, end the
 *    current Metronome shadow contract (if any) there too, and mark the local
 *    subscription as canceled at that date;
 *  - when a migration is pending: additionally unwind it — archive the pending
 *    Business contract (so Business never starts), undo the staged seat remap,
 *    and delete the pending subscription row.
 *
 * Unlike the poke `cancelPendingContract` (which *restores* the current contract
 * and keeps the workspace running), this is a real cancellation. Reversible only
 * via `resumeWorkspaceMigration` (which re-stages the migration), and only until
 * the Stripe subscription actually ends — after that it's a re-registration.
 */
export async function cancelMigratingWorkspaceSubscription(
  auth: Authenticator
): Promise<Result<{ endDate: Date }, MigrationLifecycleError>> {
  const workspace = auth.getNonNullableWorkspace();
  const { metronomeCustomerId } = workspace;

  const subscription = auth.subscriptionResource();
  if (!subscription?.stripeSubscriptionId) {
    return new Err(
      new MigrationLifecycleError(
        "invalid_state",
        "Workspace has no Stripe-billed subscription to cancel."
      )
    );
  }

  // Cancellable whether or not a migration is scheduled: a workspace with a
  // pending migration opts out (we unwind the pending contract below); one
  // without simply cancels its legacy subscription at the current period end.
  const pending = await SubscriptionResource.fetchPendingByWorkspaceModelId(
    workspace.id
  );

  // The churn lands at the end of the current billing period. When a migration
  // is pending this is ≤ the scheduled migration date (equal inside the rollout
  // window, earlier before it opens).
  const pricing = await subscription.getPerSeatPricing();
  if (!pricing || pricing.currentPeriodEndMs === null) {
    return new Err(
      new MigrationLifecycleError(
        "invalid_state",
        "Could not resolve the current billing period end."
      )
    );
  }
  const endDate = new Date(pricing.currentPeriodEndMs);

  const pendingContractId = pending?.metronomeContractId ?? null;
  if (pending) {
    // 0. Undo the seat remap staged at the pending contract start (local,
    //    idempotent — safe to re-run if a later step fails).
    if (pending.startDate) {
      await MembershipResource.cancelScheduledSeatChangesForWorkspaceAt({
        workspace,
        scheduledAt: pending.startDate,
      });
    }

    // 1. Archive the pending Business contract first. Metronome rejects editing
    //    the current contract's end (step 2) while its RENEWAL successor has
    //    finalized invoices; archiving with voidInvoices removes those.
    if (pendingContractId && metronomeCustomerId) {
      const archiveResult = await archiveMetronomeContract({
        metronomeCustomerId,
        contractId: pendingContractId,
      });
      if (archiveResult.isErr()) {
        return new Err(
          new MigrationLifecycleError(
            "upstream_error",
            `Failed to archive the pending Business contract: ${archiveResult.error.message}. No changes applied.`
          )
        );
      }
    }
  }

  // 2. Bring the current Metronome shadow contract's end forward to the current
  //    period end (switchContract had scheduled it for the migration date).
  if (subscription.metronomeContractId && metronomeCustomerId) {
    const endResult = await scheduleMetronomeContractEnd({
      metronomeCustomerId,
      contractId: subscription.metronomeContractId,
      endingBefore: endDate,
    });
    if (endResult.isErr()) {
      return new Err(
        new MigrationLifecycleError(
          "upstream_error",
          "Archived the pending Business contract but failed to update the " +
            `current contract end: ${endResult.error.message}.`
        )
      );
    }
  }

  // 3. Move the scheduled Stripe cancellation to the current period end.
  //    `scheduleSubscriptionCancellation` throws on a Stripe API failure.
  try {
    await scheduleSubscriptionCancellation({
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      cancelAt: endDate,
    });
  } catch (err) {
    return new Err(
      new MigrationLifecycleError(
        "upstream_error",
        "Archived the pending Business contract and updated the current " +
          `contract end, but failed to schedule the Stripe cancellation: ${normalizeError(err).message}.`
      )
    );
  }

  // 4. Delete the pending subscription row, if any (so a later resume can
  //    re-stage a fresh migration).
  if (pending) {
    const deleteResult = await pending.delete(auth);
    if (deleteResult.isErr()) {
      return new Err(
        new MigrationLifecycleError(
          "upstream_error",
          `Cancelled the migration but failed to delete the pending subscription row: ${deleteResult.error.message}.`
        )
      );
    }
  }

  // 5. Mark the local subscription as canceled at the current period end so the
  //    UI shows "ends on {date}".
  await subscription.markAsCanceled({ endDate });

  logger.info(
    {
      workspaceId: workspace.sId,
      endDate: endDate.toISOString(),
      archivedPendingContractId: pendingContractId,
    },
    "[migration-lifecycle] Cancelled scheduled migration; workspace churns at current period end"
  );

  return new Ok({ endDate });
}

/**
 * Undo a `cancelMigratingWorkspaceSubscription` by re-staging the migration:
 * re-provision a pending Business contract for the workspace's renewal boundary
 * (which also reschedules the Stripe cancellation and the shadow contract end to
 * the migration date) and clear the local cancellation marker.
 *
 * Only valid until the Stripe subscription actually ends; if the workspace is no
 * longer eligible (e.g. no renewal boundary remains in the window), returns an
 * error and leaves the cancellation in place.
 */
export async function resumeWorkspaceMigration(
  auth: Authenticator
): Promise<Result<undefined, MigrationLifecycleError>> {
  const workspace = auth.getNonNullableWorkspace();

  const depsResult = await loadMigrationDeps();
  if (depsResult.isErr()) {
    return new Err(
      new MigrationLifecycleError(
        "upstream_error",
        `Failed to load migration configuration: ${depsResult.error.message}.`
      )
    );
  }

  // Undo the shadow-contract end that cancel brought forward to the current
  // period end: clear it so `switchContract` can re-provision the Business
  // contract as a contiguous renewal at the (later) migration date. Otherwise
  // Metronome rejects the renewal — its start would be after the predecessor's
  // (now earlier) end date.
  const subscription = auth.subscriptionResource();
  if (subscription?.metronomeContractId && workspace.metronomeCustomerId) {
    const reactivateResult = await reactivateMetronomeContract({
      metronomeCustomerId: workspace.metronomeCustomerId,
      contractId: subscription.metronomeContractId,
    });
    if (reactivateResult.isErr()) {
      return new Err(
        new MigrationLifecycleError(
          "upstream_error",
          `Failed to restore the current contract before resuming: ${reactivateResult.error.message}.`
        )
      );
    }
  }

  // Re-stage the migration. If it fails / is not eligible we leave the
  // cancellation untouched, so the workspace stays in a consistent state.
  const migrateResult = await migrateWorkspaceToBusiness(auth, {
    deps: depsResult.value,
    execute: true,
  });
  if (migrateResult.isErr()) {
    return new Err(
      new MigrationLifecycleError(
        "upstream_error",
        `Failed to re-stage the migration: ${migrateResult.error.message}.`
      )
    );
  }
  if (migrateResult.value.status === "skipped") {
    return new Err(
      new MigrationLifecycleError(
        "invalid_state",
        `Cannot resume the migration: ${migrateResult.value.reason}. ` +
          "You will need to re-subscribe to the new pricing."
      )
    );
  }

  // Clear the local cancellation marker now that a fresh pending contract is
  // staged (the Stripe cancellation + shadow end were rescheduled to the
  // migration date by the switch).
  if (subscription) {
    await subscription.markAsCanceled({ endDate: null });
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      migrationDate: migrateResult.value.migrationDate.toISOString(),
    },
    "[migration-lifecycle] Resumed migration; pending Business contract re-staged"
  );

  return new Ok(undefined);
}
