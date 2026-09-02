/**
 * Correct seats that carry MORE granted AWU than their seat-type allocation
 * ("credit stacking"): a seat holds a live balance on TWO per-seat recurring
 * AWU credits at once — e.g. both the pro (8000) and the max (40000) credit,
 * for a total starting balance of 48000. This happens when a seat-type change
 * (or a seat-sync crash/retry storm) moved the seat onto a new tier without
 * `emptyOriginSeatCreditsForTransfers` ever zeroing the origin (stray) credit.
 * Once the seat has converged on the new tier, `syncSeatCount` sees no transfer
 * candidate and can no longer self-heal it — see `audit_metronome_seat_state.ts`
 * ("over-allocated seats").
 *
 * The fix mirrors what empty-origin would have done: post a corrective negative
 * delta to the STRAY recurring credit so the seat's TOTAL granted AWU drops back
 * to its home allocation. We debit exactly `overGrantedAwu = startingBalance -
 * homeAllocation`, which brings the seat's aggregate balance to
 * `homeAllocation - consumed` regardless of which pool consumption came out of
 * (aggregate arithmetic; see the block comment on `planSeatCorrection`).
 *
 * IMPORTANT — read before running with --execute:
 *
 *  - There is NO Metronome read that returns a seat's balance on a SPECIFIC
 *    recurring credit; every read collapses pro/max into one aggregate AWU
 *    number. So we cannot observe the stray pool's balance directly; we debit
 *    the computed `overGrantedAwu`. If the stray pool had some consumption, that
 *    debit can leave the stray pool slightly negative (bounded by the seat's
 *    consumption this cycle). That is harmless for a seat no longer assigned to
 *    the stray tier (nothing draws from it; it expires next recurrence), and the
 *    seat's AGGREGATE lands exactly on `homeAllocation - consumed`.
 *  - Only seats whose `overGrantedAwu` exactly matches another tier's allocation
 *    are auto-classified (e.g. a `max` seat over by 8000 -> stray `pro`). Seats
 *    that don't match a tier (e.g. a `free` seat over by 7500) are reported as
 *    UNCLASSIFIED and never touched — they need separate investigation.
 *  - `adjustSeatCreditBalances` does NOT dedup; a second --execute run posts the
 *    delta AGAIN (double-correcting). Run --execute exactly once, and re-run the
 *    audit afterwards to confirm rather than re-running this.
 *
 * Dry-run by default (prints the full plan, including per-seat segment/timestamp
 * resolution). Pass --execute to apply. Use --seatId to restrict to a single
 * seat (validate the mechanics on one before a bulk run), and --homeSeatType to
 * scope to seats currently of a given tier (e.g. only the confident `max` set).
 *
 *   npx tsx scripts/fix_metronome_stacked_seat_credits.ts --workspaceId <wId>
 *   npx tsx scripts/fix_metronome_stacked_seat_credits.ts --workspaceId <wId> --homeSeatType max --seatId <userId>
 *   npx tsx scripts/fix_metronome_stacked_seat_credits.ts --workspaceId <wId> --homeSeatType max --execute
 */
import config from "@app/lib/api/config";
import {
  adjustSeatCreditBalances,
  findSeatCreditSegmentForPeriod,
  getMetronomeSeatActiveSince,
  getMetronomeSubscriptionSeatState,
  listMetronomeSeatBalances,
} from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { getSeatCreditNameForSeatType } from "@app/lib/metronome/seats";
import {
  getAwuAllocationForSeatType,
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import { makeScript } from "./helpers";

// Below this, a seat's over-grant is treated as rounding noise, not stacking.
const AWU_OVER_ALLOCATION_TOLERANCE = 1;

// Metronome publishes an 11 RPS API limit. Stay well under it so a correction
// run never adds rate-limit pressure to production traffic on the same key.
const METRONOME_MAX_RPS = 8;
const METRONOME_MIN_INTERVAL_MS = 1000 / METRONOME_MAX_RPS;
let metronomeNextSlotAt = 0;

async function paceMetronome<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const slot = Math.max(now, metronomeNextSlotAt);
  metronomeNextSlotAt = slot + METRONOME_MIN_INTERVAL_MS;
  const wait = slot - now;
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  return fn();
}

interface StrayTierInfo {
  seatType: MembershipSeatType;
  subscriptionId: string;
  recurringCreditId: string;
  allocation: number;
}

interface SeatCorrection {
  seatId: string;
  homeSeatType: MembershipSeatType;
  homeAllocation: number;
  startingBalance: number;
  currentBalance: number;
  overGrantedAwu: number;
  strayType: MembershipSeatType;
  strayRecurringCreditId: string;
  // Resolved lazily during planning; null means the ledger entry cannot be
  // placed (no stray-tier active window or no matching credit segment).
  creditId: string | null;
  segmentId: string | null;
  adjustmentTimestamp: Date | null;
}

async function fixWorkspace(
  workspaceId: string,
  {
    execute,
    onlySeatId,
    onlyHomeSeatType,
    logger,
  }: {
    execute: boolean;
    onlySeatId: string | null;
    onlyHomeSeatType: MembershipSeatType | null;
    logger: Logger;
  }
) {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.error({ workspaceId }, "[StackedFix] workspace not found");
    return;
  }
  const lightWorkspace = renderLightWorkspaceType({ workspace });
  const { metronomeCustomerId } = lightWorkspace;
  if (!metronomeCustomerId) {
    logger.error(
      { workspaceId },
      "[StackedFix] workspace is not provisioned on Metronome"
    );
    return;
  }

  const activeSubscription =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
  const contractId = activeSubscription?.metronomeContractId ?? null;
  if (!contractId) {
    logger.error({ workspaceId }, "[StackedFix] no active Metronome contract");
    return;
  }
  const contract = await getActiveContract(workspaceId);
  if (!contract) {
    logger.error(
      { workspaceId, contractId },
      "[StackedFix] could not resolve the active contract from Metronome"
    );
    return;
  }

  // Recurring-credit tiers (pro/max families). `free`/`workspace`/`none` carry
  // no per-seat recurring credit (getSeatCreditNameForSeatType === null), so
  // they are neither a home nor a stray tier here.
  const productSeatTypes = await getProductSeatTypes();
  const seatSubscriptions = [
    ...getSeatSubscriptionsFromContract(contract, productSeatTypes),
  ];
  const tierBySeatType = new Map<MembershipSeatType, StrayTierInfo>();
  const allocationBySeatType = new Map<MembershipSeatType, number>();
  for (const [seatType, sub] of seatSubscriptions) {
    const allocation = getAwuAllocationForSeatType(
      contract,
      seatType,
      productSeatTypes
    );
    allocationBySeatType.set(seatType, allocation);
    if (!sub.id || !getSeatCreditNameForSeatType(seatType)) {
      continue;
    }
    const recurringCredit = (contract.recurring_credits ?? []).find(
      (c) => c.subscription_config?.subscription_id === sub.id
    );
    if (recurringCredit?.id) {
      tierBySeatType.set(seatType, {
        seatType,
        subscriptionId: sub.id,
        recurringCreditId: recurringCredit.id,
        allocation,
      });
    }
  }

  // Map every assigned seat to its home (current) tier.
  const seatTypeBySeatId = new Map<string, MembershipSeatType>();
  for (const [seatType, sub] of seatSubscriptions) {
    if (!sub.id) {
      continue;
    }
    const stateRes = await paceMetronome(() =>
      getMetronomeSubscriptionSeatState({
        metronomeCustomerId,
        contractId,
        subscriptionId: sub.id as string,
      })
    );
    if (stateRes.isErr()) {
      logger.error(
        { workspaceId, seatType, err: stateRes.error.message },
        "[StackedFix] failed to read Metronome seat state"
      );
      continue;
    }
    for (const id of stateRes.value.assignedSeatIds) {
      seatTypeBySeatId.set(id, seatType);
    }
  }

  // Read aggregate AWU balances for all assigned seats.
  const seatIds = [...seatTypeBySeatId.keys()];
  const balancesRes = await paceMetronome(() =>
    listMetronomeSeatBalances({
      metronomeCustomerId,
      metronomeContractId: contractId,
      seatIds,
    })
  );
  if (balancesRes.isErr()) {
    logger.error(
      { workspaceId, err: balancesRes.error.message },
      "[StackedFix] failed to read seat balances"
    );
    return;
  }
  const awuCreditTypeId = getCreditTypeAwuId();
  const awuBySeatId = new Map<
    string,
    { balance: number; startingBalance: number }
  >();
  for (const seat of balancesRes.value) {
    const awu = seat.balances.find((b) => b.credit_type_id === awuCreditTypeId);
    if (awu) {
      awuBySeatId.set(seat.seat_id, {
        balance: awu.balance,
        startingBalance: awu.starting_balance,
      });
    }
  }

  // Classify each over-allocated seat. The stray tier is the recurring tier
  // (other than the seat's home tier) whose allocation exactly equals the
  // over-grant — that is the credit whose orphaned grant is stacked on top.
  const corrections: SeatCorrection[] = [];
  const unclassified: Array<{
    seatId: string;
    homeSeatType: MembershipSeatType;
    overGrantedAwu: number;
  }> = [];
  for (const [seatId, homeSeatType] of seatTypeBySeatId) {
    if (onlySeatId && seatId !== onlySeatId) {
      continue;
    }
    if (onlyHomeSeatType && homeSeatType !== onlyHomeSeatType) {
      continue;
    }
    const homeAllocation = allocationBySeatType.get(homeSeatType);
    const awu = awuBySeatId.get(seatId);
    if (homeAllocation === undefined || homeAllocation <= 0 || !awu) {
      continue;
    }
    const overGrantedAwu = awu.startingBalance - homeAllocation;
    if (overGrantedAwu <= AWU_OVER_ALLOCATION_TOLERANCE) {
      continue;
    }
    const strayTier = [...tierBySeatType.values()].find(
      (t) =>
        t.seatType !== homeSeatType &&
        Math.abs(t.allocation - overGrantedAwu) <= AWU_OVER_ALLOCATION_TOLERANCE
    );
    if (!strayTier) {
      unclassified.push({ seatId, homeSeatType, overGrantedAwu });
      continue;
    }
    corrections.push({
      seatId,
      homeSeatType,
      homeAllocation,
      startingBalance: awu.startingBalance,
      currentBalance: awu.balance,
      overGrantedAwu,
      strayType: strayTier.seatType,
      strayRecurringCreditId: strayTier.recurringCreditId,
      creditId: null,
      segmentId: null,
      adjustmentTimestamp: null,
    });
  }

  // Resolve the stray credit segment + a valid entry timestamp per seat. The
  // entry must fall inside the stray credit segment AND at a time the seat is
  // active in the stray subscription (mirrors resolveSeatAdjustmentTimestamp in
  // seats.ts). A seat that never had a stray-tier active window this segment
  // cannot receive the ledger entry this way and is reported unresolved.
  const segmentCache = new Map<
    string,
    { creditId: string; segmentId: string; segmentStartingAt: string } | null
  >();
  for (const c of corrections) {
    let seg = segmentCache.get(c.strayRecurringCreditId);
    if (seg === undefined) {
      const segRes = await paceMetronome(() =>
        findSeatCreditSegmentForPeriod({
          metronomeCustomerId,
          metronomeContractId: contractId,
          recurringCreditId: c.strayRecurringCreditId,
        })
      );
      seg = segRes.isOk() ? segRes.value : null;
      segmentCache.set(c.strayRecurringCreditId, seg);
    }
    if (!seg) {
      continue;
    }
    c.creditId = seg.creditId;
    c.segmentId = seg.segmentId;
    const strayTier = tierBySeatType.get(c.strayType);
    if (!strayTier) {
      continue;
    }
    const activeSinceRes = await paceMetronome(() =>
      getMetronomeSeatActiveSince({
        metronomeCustomerId,
        contractId,
        subscriptionId: strayTier.subscriptionId,
        seatId: c.seatId,
      })
    );
    if (activeSinceRes.isErr() || !activeSinceRes.value) {
      continue;
    }
    c.adjustmentTimestamp = new Date(
      Math.max(
        activeSinceRes.value.getTime(),
        new Date(seg.segmentStartingAt).getTime()
      )
    );
  }

  const resolved = corrections.filter(
    (c) => c.creditId && c.segmentId && c.adjustmentTimestamp
  );
  const unresolved = corrections.filter(
    (c) => !c.creditId || !c.segmentId || !c.adjustmentTimestamp
  );

  const byTransition = new Map<string, { count: number; totalAwu: number }>();
  for (const c of resolved) {
    const key = `${c.homeSeatType}<-${c.strayType} (-${c.overGrantedAwu})`;
    const agg = byTransition.get(key) ?? { count: 0, totalAwu: 0 };
    agg.count += 1;
    agg.totalAwu += c.overGrantedAwu;
    byTransition.set(key, agg);
  }

  logger.info(
    {
      workspaceId,
      contractId,
      execute,
      onlySeatId,
      onlyHomeSeatType,
      resolvedCount: resolved.length,
      resolvedTotalAwu: resolved.reduce((s, c) => s + c.overGrantedAwu, 0),
      byTransition: Object.fromEntries(byTransition),
      unresolvedCount: unresolved.length,
      unresolvedSeatIds: unresolved.map((c) => c.seatId),
      unclassifiedCount: unclassified.length,
      unclassified,
    },
    "[StackedFix] correction plan"
  );

  if (!execute) {
    logger.info(
      { workspaceId },
      "[StackedFix] dry run — pass --execute to apply the plan above"
    );
    return;
  }

  let applied = 0;
  for (const c of resolved) {
    const adjustRes = await paceMetronome(() =>
      adjustSeatCreditBalances({
        metronomeCustomerId,
        metronomeContractId: contractId,
        creditId: c.creditId as string,
        segmentId: c.segmentId as string,
        perSeatAmounts: { [c.seatId]: -c.overGrantedAwu },
        reason: `Stacked-credit correction: empty orphaned ${c.strayType} grant stacked on ${c.homeSeatType}`,
        timestamp: c.adjustmentTimestamp as Date,
        alignToHour: false,
      })
    );
    if (adjustRes.isErr()) {
      logger.error(
        {
          workspaceId,
          seatId: c.seatId,
          strayType: c.strayType,
          err: adjustRes.error.message,
        },
        "[StackedFix] failed to correct seat — skipping"
      );
      continue;
    }
    applied += 1;
    logger.info(
      {
        workspaceId,
        seatId: c.seatId,
        homeSeatType: c.homeSeatType,
        strayType: c.strayType,
        amount: -c.overGrantedAwu,
        adjustmentTimestamp: c.adjustmentTimestamp?.toISOString(),
      },
      "[StackedFix] corrected stacked seat"
    );
  }
  logger.info(
    { workspaceId, applied, planned: resolved.length },
    "[StackedFix] done"
  );
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      describe: "sId of the workspace to correct",
    },
    seatId: {
      type: "string",
      describe:
        "Restrict to a single seat (userId) — validate the mechanics on one " +
        "before a bulk run",
    },
    homeSeatType: {
      type: "string",
      describe:
        "Restrict to seats currently of this tier (e.g. 'max' for the " +
        "confident pro-on-max set)",
    },
  },
  async ({ workspaceId, seatId, homeSeatType, execute }, logger) => {
    if (!config.getMetronomeApiKey()) {
      logger.error({}, "[StackedFix] METRONOME_API_KEY is not configured");
      return;
    }
    await fixWorkspace(workspaceId, {
      execute,
      onlySeatId: seatId ?? null,
      onlyHomeSeatType: (homeSeatType as MembershipSeatType | undefined) ?? null,
      logger,
    });
  }
);
