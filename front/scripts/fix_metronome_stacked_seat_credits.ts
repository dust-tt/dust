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
 * Detection is grant-history based (authoritative, ES-free): a per-seat
 * recurring credit grants exactly its allocation to whoever is on its
 * subscription at the credit segment start, so a seat holds a stray grant iff it
 * appears in a tier's grant-time assignment but is now on a different tier. The
 * fix posts a corrective negative delta to that stray credit — `min(stray
 * allocation, current aggregate balance)` — reversing the stray grant still on
 * the balance so the seat's aggregate AWU drops back to `max(0, homeAllocation -
 * consumed)`. All stray grants on the same stray credit share that credit's
 * segment start as a valid entry time, so they are applied in ONE batched ledger
 * entry per stray credit (write cost is O(stray credits), not O(seats)).
 *
 * IMPORTANT — read before running with --execute:
 *
 *  - There is NO Metronome read that returns a seat's balance on a SPECIFIC
 *    recurring credit; every read collapses pro/max into one aggregate AWU
 *    number. We debit the stray allocation capped at the aggregate balance, so
 *    the aggregate never goes negative; if the stray pool itself had some
 *    consumption the debit can leave THAT pool slightly negative — harmless for
 *    a seat no longer assigned to the stray tier (nothing draws from it; it
 *    expires next recurrence).
 *  - Each credit-bearing tier is checked independently, so same-family stacks
 *    (pro + pro_yearly = two 8000 grants) and seats carrying several stray
 *    grants are all corrected, each on its own stray credit.
 *  - `adjustSeatCreditBalances` does NOT dedup, and grant-history cannot tell a
 *    still-present stray grant from one already emptied. So a seat corrected in a
 *    prior run (or manually) would be corrected AGAIN. Run --execute exactly
 *    once per cohort, pass already-fixed seats via --excludeSeatIds, and re-run
 *    the audit afterwards to confirm rather than re-running this.
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
  getMetronomeSubscriptionSeatState,
  invalidateCachedCustomerPerUserCreditBalances,
  listMetronomeSeatBalances,
} from "@app/lib/metronome/client";
import type { ContractCreditType } from "@app/lib/metronome/constants";
import {
  CONTRACT_CREDIT_TYPE_EXCESS,
  CONTRACT_CREDIT_TYPE_FREE_SEAT,
  CONTRACT_CREDIT_TYPE_POOL,
  getCreditTypeAwuId,
} from "@app/lib/metronome/constants";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getAwuAllocationForSeatType,
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import { getSeatCreditNameForSeatType } from "@app/lib/metronome/seats";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";

import { makeScript } from "./helpers";

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
  // Current tier, or "unassigned" if the seat holds a grant but is no longer on
  // any seat in the workspace.
  homeSeatType: MembershipSeatType | "unassigned";
  strayType: MembershipSeatType;
  strayAllocation: number;
  currentBalance: number;
  // Debited from the stray credit: the stray grant still on the balance,
  // min(strayAllocation, currentBalance) — never exceeds the balance.
  clawBackAwu: number;
  creditId: string;
  segmentId: string;
  adjustmentTimestamp: Date;
}

async function fixWorkspace(
  workspaceId: string,
  {
    execute,
    onlySeatId,
    onlyHomeSeatType,
    excludeSeatIds,
    logger,
  }: {
    execute: boolean;
    onlySeatId: string | null;
    onlyHomeSeatType: MembershipSeatType | null;
    excludeSeatIds: Set<string>;
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
  for (const [seatType, sub] of seatSubscriptions) {
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
        allocation: getAwuAllocationForSeatType(
          contract,
          seatType,
          productSeatTypes
        ),
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
  // Current aggregate AWU balance per seat — only used to cap each claw-back at
  // what the seat still holds, so a correction never drives the balance negative.
  const awuCreditTypeId = getCreditTypeAwuId();
  const awuBalanceBySeatId = new Map<string, number>();
  for (const seat of balancesRes.value) {
    const balance = seat.balances
      .filter((b) => b.credit_type_id === awuCreditTypeId)
      .reduce((sum, b) => sum + b.balance, 0);
    awuBalanceBySeatId.set(seat.seat_id, balance);
  }

  // Grant-history stacked-seat detection (authoritative, ES-free). Each
  // credit-bearing tier grants exactly its allocation to whoever is on its
  // subscription at the credit segment start; a seat holds a stray grant iff it
  // appears in a tier's grant-time assignment but is now on a different tier.
  // (See audit_metronome_seat_state.ts for why starting_balance / analytics
  // consumption are both unreliable here.) Each tier is checked independently,
  // so same-family stacks (pro + pro_yearly) and multi-stray seats are caught.
  //
  // Every stray grant on the same stray credit shares that credit's segment
  // start as a valid entry time, so they are corrected in ONE batched ledger
  // entry (adjustSeatCreditBalances with a per-seat amounts map) — the write
  // cost is O(stray credits), not O(seats).
  const corrections: SeatCorrection[] = [];
  const skippedTiersNoSegment: MembershipSeatType[] = [];
  for (const tier of tierBySeatType.values()) {
    const segRes = await paceMetronome(() =>
      findSeatCreditSegmentForPeriod({
        metronomeCustomerId,
        metronomeContractId: contractId,
        recurringCreditId: tier.recurringCreditId,
      })
    );
    const segment = segRes.isOk() ? segRes.value : null;
    if (!segment) {
      logger.warn(
        {
          workspaceId,
          strayType: tier.seatType,
          err: segRes.isErr() ? segRes.error.message : "no active segment",
        },
        "[StackedFix] no credit segment for tier — skipping"
      );
      skippedTiersNoSegment.push(tier.seatType);
      continue;
    }
    const grantStateRes = await paceMetronome(() =>
      getMetronomeSubscriptionSeatState({
        metronomeCustomerId,
        contractId,
        subscriptionId: tier.subscriptionId,
        coveringDate: new Date(segment.segmentStartingAt),
      })
    );
    if (grantStateRes.isErr()) {
      logger.error(
        {
          workspaceId,
          strayType: tier.seatType,
          err: grantStateRes.error.message,
        },
        "[StackedFix] failed to read grant-time assignment — skipping tier"
      );
      skippedTiersNoSegment.push(tier.seatType);
      continue;
    }
    // Segment start: a shared, in-segment, hour-aligned entry time at which
    // every granted seat held the grant — lets all seats on this credit batch.
    const adjustmentTimestamp = new Date(segment.segmentStartingAt);
    for (const seatId of grantStateRes.value.assignedSeatIds) {
      if (onlySeatId && seatId !== onlySeatId) {
        continue;
      }
      if (excludeSeatIds.has(seatId)) {
        continue;
      }
      const homeSeatType = seatTypeBySeatId.get(seatId) ?? null;
      if (homeSeatType === tier.seatType) {
        // Grant is legitimate — the seat is still on this tier.
        continue;
      }
      if (onlyHomeSeatType && homeSeatType !== onlyHomeSeatType) {
        continue;
      }
      const currentBalance = awuBalanceBySeatId.get(seatId) ?? 0;
      if (currentBalance <= 0) {
        // Nothing left on the balance to reclaim (already fully consumed and/or
        // corrected). Skipping keeps the aggregate from going negative.
        continue;
      }
      corrections.push({
        seatId,
        homeSeatType: homeSeatType ?? "unassigned",
        strayType: tier.seatType,
        strayAllocation: tier.allocation,
        currentBalance,
        // Remove the stray grant still on the balance, capped at the balance so
        // the aggregate never drops below max(0, homeAllocation - consumed).
        clawBackAwu: Math.min(tier.allocation, currentBalance),
        creditId: segment.creditId,
        segmentId: segment.segmentId,
        adjustmentTimestamp,
      });
    }
  }

  // Group corrections by stray credit segment — one batched ledger entry each.
  const batches = new Map<
    string,
    {
      creditId: string;
      segmentId: string;
      strayType: MembershipSeatType;
      timestamp: Date;
      items: SeatCorrection[];
    }
  >();
  for (const c of corrections) {
    const key = `${c.creditId}:${c.segmentId}`;
    const batch = batches.get(key) ?? {
      creditId: c.creditId,
      segmentId: c.segmentId,
      strayType: c.strayType,
      timestamp: c.adjustmentTimestamp,
      items: [],
    };
    batch.items.push(c);
    batches.set(key, batch);
  }

  const byTransition = new Map<string, { count: number; totalAwu: number }>();
  for (const c of corrections) {
    const key = `${c.homeSeatType}<-${c.strayType}`;
    const agg = byTransition.get(key) ?? { count: 0, totalAwu: 0 };
    agg.count += 1;
    agg.totalAwu += c.clawBackAwu;
    byTransition.set(key, agg);
  }

  logger.info(
    {
      workspaceId,
      contractId,
      execute,
      onlySeatId,
      onlyHomeSeatType,
      excludedSeatCount: excludeSeatIds.size,
      strayGrantCount: corrections.length,
      affectedSeatCount: new Set(corrections.map((c) => c.seatId)).size,
      totalClawBackAwu: corrections.reduce((s, c) => s + c.clawBackAwu, 0),
      batchedAdjustCalls: batches.size,
      byTransition: Object.fromEntries(byTransition),
      skippedTiersNoSegment,
      corrections,
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

  let appliedSeats = 0;
  for (const batch of batches.values()) {
    const perSeatAmounts = Object.fromEntries(
      batch.items.map((c) => [c.seatId, -c.clawBackAwu])
    );
    const adjustRes = await paceMetronome(() =>
      adjustSeatCreditBalances({
        metronomeCustomerId,
        metronomeContractId: contractId,
        creditId: batch.creditId,
        segmentId: batch.segmentId,
        perSeatAmounts,
        reason: `Stacked-credit correction: empty orphaned ${batch.strayType} grant`,
        timestamp: batch.timestamp,
        alignToHour: false,
      })
    );
    if (adjustRes.isErr()) {
      logger.error(
        {
          workspaceId,
          strayType: batch.strayType,
          creditId: batch.creditId,
          seatCount: batch.items.length,
          err: adjustRes.error.message,
        },
        "[StackedFix] batched correction failed"
      );
      continue;
    }
    appliedSeats += batch.items.length;
    logger.info(
      {
        workspaceId,
        strayType: batch.strayType,
        creditId: batch.creditId,
        seatCount: batch.items.length,
        totalAwu: batch.items.reduce((s, c) => s + c.clawBackAwu, 0),
        timestamp: batch.timestamp.toISOString(),
      },
      "[StackedFix] applied batched correction"
    );
  }

  // Bust the 1-hour per-user credit-balance Redis cache
  // (getCachedCustomerPerUserCreditBalances) so poke reflects the corrections
  // without waiting out the TTL. A manual balance entry does NOT fire the
  // Metronome credit.create / segment.start webhook that normally invalidates
  // it, so nothing else clears it. This covers the free-seat / pool surfaces
  // that read the cache; the pro/max seat balance in the members table is read
  // LIVE (uncached listMetronomeSeatBalances), so its brief post-correction lag
  // is Metronome's own seat-balance read model catching up and self-heals.
  if (appliedSeats > 0) {
    const contractCreditTypes: ContractCreditType[] = [
      CONTRACT_CREDIT_TYPE_FREE_SEAT,
      CONTRACT_CREDIT_TYPE_POOL,
      CONTRACT_CREDIT_TYPE_EXCESS,
    ];
    for (const contractCreditType of contractCreditTypes) {
      await invalidateCachedCustomerPerUserCreditBalances({
        metronomeCustomerId,
        contractCreditType,
      });
    }
    logger.info(
      { workspaceId, metronomeCustomerId },
      "[StackedFix] invalidated cached per-user credit balances"
    );
  }

  logger.info(
    { workspaceId, appliedSeats, plannedSeats: corrections.length },
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
    excludeSeatIds: {
      type: "string",
      describe:
        "Comma-separated seat ids (userIds) to skip — e.g. seats already " +
        "corrected manually, since adjustSeatCreditBalances does not dedup",
    },
  },
  async (
    { workspaceId, seatId, homeSeatType, excludeSeatIds, execute },
    logger
  ) => {
    if (!config.getMetronomeApiKey()) {
      logger.error({}, "[StackedFix] METRONOME_API_KEY is not configured");
      return;
    }
    await fixWorkspace(workspaceId, {
      execute,
      onlySeatId: seatId ?? null,
      onlyHomeSeatType:
        (homeSeatType as MembershipSeatType | undefined) ?? null,
      excludeSeatIds: new Set(
        (excludeSeatIds ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      ),
      logger,
    });
  }
);
