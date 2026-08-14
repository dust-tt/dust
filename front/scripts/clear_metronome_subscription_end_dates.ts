/**
 * Reopen Metronome seat subscriptions that were left with a scheduled end date.
 *
 * Ending a contract truncates its subscriptions to the contract end. Clearing
 * the contract end date afterwards (`reactivateMetronomeContract`, e.g. a
 * cancel → reactivate round trip) reopens the CONTRACT but leaves every
 * subscription bounded to the period end that was current at cancellation
 * time. The workspace keeps working until that date passes, then the seat
 * subscriptions are dead: `syncSeatCount` fails with "Subscription seat add
 * starting at date must be before the subscription ends", the seat sync retries
 * forever, no seat is billed, and members stay stuck in the `on_pool` credit
 * state (the credit-state reconcile runs after the seat sync and never gets
 * there).
 *
 * This clears `ending_before` on the contract's subscriptions so they are
 * open-ended again, then invalidates the cached contract.
 *
 * By default only subscriptions whose end date has already PASSED are touched
 * (the ones actively breaking); pass --all to also reopen subscriptions ending
 * in the future (e.g. the annual seats of the same contract, which carry the
 * same latent breakage on a later date). Dry-run by default.
 *
 * NOTE: this does not re-bill the window during which the subscription was
 * dead — seats billed zero for that period and that needs a manual adjustment.
 * Run the poke "Sync Metronome Seat Count" plugin afterwards to reassign seats.
 *
 *   npx tsx scripts/clear_metronome_subscription_end_dates.ts --workspaceId <wId>
 *   npx tsx scripts/clear_metronome_subscription_end_dates.ts --workspaceId <wId> --all --execute
 */
import {
  clearSubscriptionEndDates,
  getMetronomeContractById,
} from "@app/lib/metronome/client";
import {
  invalidateContractCache,
  resolveActiveMetronomeIds,
} from "@app/lib/metronome/plan_type";

import { makeScript } from "./helpers";

makeScript(
  {
    workspaceId: {
      alias: "w",
      type: "string" as const,
      description: "Workspace sId whose contract subscriptions to reopen",
      demandOption: true,
    },
    contractId: {
      type: "string" as const,
      description:
        "Metronome contract id to fix (defaults to the workspace's active contract)",
      demandOption: false,
    },
    all: {
      type: "boolean" as const,
      description:
        "Also reopen subscriptions whose end date is still in the future",
      default: false,
    },
  },
  async ({ workspaceId, contractId, all, execute }, logger) => {
    const ids = await resolveActiveMetronomeIds(workspaceId);
    if (!ids) {
      logger.error(
        { workspaceId },
        "No Metronome customer / active contract for this workspace"
      );
      return;
    }
    const { metronomeCustomerId } = ids;
    const metronomeContractId = contractId ?? ids.metronomeContractId;

    const contractResult = await getMetronomeContractById({
      metronomeCustomerId,
      metronomeContractId,
    });
    if (contractResult.isErr()) {
      logger.error(
        {
          workspaceId,
          metronomeContractId,
          error: contractResult.error,
        },
        "Failed to fetch Metronome contract"
      );
      return;
    }
    const contract = contractResult.value;

    const nowMs = Date.now();
    const endingSubscriptions = (contract.subscriptions ?? []).flatMap((sub) =>
      sub.id && sub.ending_before
        ? [
            {
              id: sub.id,
              productName: sub.subscription_rate.product.name,
              billingFrequency: sub.subscription_rate.billing_frequency,
              startingAt: sub.starting_at,
              endingBefore: sub.ending_before,
              hasEnded: Date.parse(sub.ending_before) <= nowMs,
            },
          ]
        : []
    );

    logger.info(
      {
        workspaceId,
        metronomeContractId,
        contractEndingBefore: contract.ending_before ?? null,
        subscriptionCount: (contract.subscriptions ?? []).length,
        withEndDate: endingSubscriptions.length,
        alreadyEnded: endingSubscriptions.filter((s) => s.hasEnded).length,
        subscriptions: endingSubscriptions,
      },
      "Current subscription end dates"
    );

    // A contract that is genuinely scheduled to end (a real cancellation, a
    // pending switch) is SUPPOSED to have its subscriptions bounded — reopening
    // them there would resurrect billing the customer cancelled.
    if (contract.ending_before) {
      logger.error(
        {
          workspaceId,
          metronomeContractId,
          contractEndingBefore: contract.ending_before,
        },
        "Contract itself has an end date — refusing to reopen its subscriptions"
      );
      return;
    }

    const toReopen = endingSubscriptions.filter((s) => all || s.hasEnded);
    if (toReopen.length === 0) {
      logger.info(
        { workspaceId, metronomeContractId },
        "No subscription to reopen"
      );
      return;
    }

    if (!execute) {
      logger.info(
        {
          workspaceId,
          metronomeContractId,
          subscriptions: toReopen,
        },
        "[DRY RUN] Would clear the end date on these subscriptions"
      );
      return;
    }

    const clearResult = await clearSubscriptionEndDates({
      metronomeCustomerId,
      contractId: metronomeContractId,
      subscriptionIds: toReopen.map((s) => s.id),
    });
    if (clearResult.isErr()) {
      logger.error(
        {
          workspaceId,
          metronomeContractId,
          error: clearResult.error,
        },
        "Failed to clear subscription end dates"
      );
      return;
    }

    await invalidateContractCache(workspaceId);

    // Read back rather than trusting the edit: Metronome may not accept
    // reopening a subscription whose end is already in the past, and a silent
    // no-op here looks identical to a fix.
    const verifyResult = await getMetronomeContractById({
      metronomeCustomerId,
      metronomeContractId,
    });
    if (verifyResult.isErr()) {
      logger.warn(
        { workspaceId, metronomeContractId, error: verifyResult.error },
        "Cleared end dates but failed to re-read the contract to verify"
      );
      return;
    }
    const stillEnding = (verifyResult.value.subscriptions ?? []).flatMap(
      (sub) =>
        sub.id && sub.ending_before && toReopen.some((s) => s.id === sub.id)
          ? [{ id: sub.id, endingBefore: sub.ending_before }]
          : []
    );
    if (stillEnding.length > 0) {
      logger.error(
        { workspaceId, metronomeContractId, stillEnding },
        "Some subscriptions still have an end date after the edit"
      );
      return;
    }

    logger.info(
      {
        workspaceId,
        metronomeContractId,
        reopenedCount: toReopen.length,
      },
      "Subscription end dates cleared — run the poke seat sync plugin next"
    );
  }
);
