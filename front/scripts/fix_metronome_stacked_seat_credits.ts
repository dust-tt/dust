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
 * appears in a tier's grant-time assignment but is now on a different tier.
 *
 * The correction is IDEMPOTENT via reconcile-to-target: each affected seat
 * should hold `max(0, homeAllocation - consumed)`; the fix posts a negative
 * delta to the stray credit equal to the seat's excess above that target
 * (`max(0, currentBalance - target)`). A seat already at/below target — fixed by
 * a prior run, empty-origin, or manually — yields ~0 and is skipped, so re-runs
 * are safe WITHOUT knowing which seats were already fixed. `consumed` is the
 * analytics figure; because grant-history alone decides WHO is touched and the
 * claw-back is floored at 0, analytics lag can only under-correct — it can never
 * add credit or touch a healthy seat. All corrections on the same stray credit
 * share that credit's segment start as their entry time, so they apply in ONE
 * batched ledger entry per stray credit (write cost is O(stray credits)).
 *
 * IMPORTANT — read before running with --execute:
 *
 *  - There is NO Metronome read that returns a seat's balance on a SPECIFIC
 *    recurring credit (per_group_amounts is write-only), so exact per-credit
 *    idempotency is impossible; reconcile-to-target on the aggregate is how we
 *    get idempotency instead. The delta drives the aggregate to target by
 *    adjusting the stray credit, which can leave THAT pool negative — harmless
 *    for a seat no longer assigned to it (nothing draws from it; it expires next
 *    recurrence).
 *  - Each credit-bearing tier is checked independently, so same-family stacks
 *    (pro + pro_yearly) and seats carrying several stray grants are caught; such
 *    a seat is reconciled once (its whole aggregate to target) on the first
 *    stray credit.
 *  - `--excludeSeatIds` still exists for belt-and-suspenders, but is not required
 *    for safety: an already-fixed seat is a no-op. Re-run the audit afterwards to
 *    confirm.
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
import { fetchConsumedAwuCreditsFromMetronomeByUserId } from "@app/lib/api/credits/members_usage";
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
  homeAllocation: number;
  consumedAwu: number;
  currentBalance: number;
  targetBalance: number;
  // Reconcile amount debited from the stray credit: max(0, currentBalance -
  // target). Idempotent — a seat already at/below target (fixed by a prior run,
  // empty-origin, or manually) yields ~0 and is skipped.
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
  // Allocation for EVERY seat type (incl. free), used to size each seat's
  // reconcile target from its current (home) tier.
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

  // Phase 1 — pair each seat on a credit-bearing tier with its stray credit (the
  // OTHER credit-bearing tier: home max -> stray pro, home pro -> stray max).
  // Detection is NOT grant-history: a seat's stray grant can sit in an EARLIER
  // credit segment than the current one (it moved tier before the latest segment
  // started), so grant-time assignment under-detects it. Reconcile in phase 2
  // (balance vs homeAllocation - consumed) is what actually flags a seat; this
  // phase only resolves WHERE the excess would be reversed.
  const strayCreditByTier = new Map<
    MembershipSeatType,
    { creditId: string; segmentId: string; adjustmentTimestamp: Date } | null
  >();
  const resolveStrayCredit = async (tier: StrayTierInfo) => {
    const cached = strayCreditByTier.get(tier.seatType);
    if (cached !== undefined) {
      return cached;
    }
    const segRes = await paceMetronome(() =>
      findSeatCreditSegmentForPeriod({
        metronomeCustomerId,
        metronomeContractId: contractId,
        recurringCreditId: tier.recurringCreditId,
      })
    );
    const segment = segRes.isOk() ? segRes.value : null;
    const resolved = segment
      ? {
          creditId: segment.creditId,
          segmentId: segment.segmentId,
          // Shared, in-segment entry time so all seats on this credit batch.
          adjustmentTimestamp: new Date(segment.segmentStartingAt),
        }
      : null;
    strayCreditByTier.set(tier.seatType, resolved);
    return resolved;
  };

  const creditBearingTiers = [...tierBySeatType.values()];
  const strayInfoBySeat = new Map<
    string,
    {
      homeSeatType: MembershipSeatType;
      strayType: MembershipSeatType;
      creditId: string;
      segmentId: string;
      adjustmentTimestamp: Date;
    }
  >();
  const skippedAmbiguousStray = new Set<MembershipSeatType>();
  for (const [seatId, homeSeatType] of seatTypeBySeatId) {
    if (onlySeatId && seatId !== onlySeatId) {
      continue;
    }
    if (excludeSeatIds.has(seatId)) {
      continue;
    }
    if (onlyHomeSeatType && homeSeatType !== onlyHomeSeatType) {
      continue;
    }
    // Only seats currently on a credit-bearing tier are corrected here (a free/
    // none home has no recurring credit of its own and an ambiguous stray).
    if (!tierBySeatType.has(homeSeatType)) {
      continue;
    }
    const strayCandidates = creditBearingTiers.filter(
      (t) => t.seatType !== homeSeatType
    );
    if (strayCandidates.length !== 1) {
      // >2 credit-bearing tiers (e.g. yearly variants present): can't infer
      // which pool holds the stray grant. Reported and skipped.
      skippedAmbiguousStray.add(homeSeatType);
      continue;
    }
    const stray = await resolveStrayCredit(strayCandidates[0]);
    if (!stray) {
      continue;
    }
    strayInfoBySeat.set(seatId, {
      homeSeatType,
      strayType: strayCandidates[0].seatType,
      ...stray,
    });
  }

  // Phase 2 — reconcile-to-target: each seat should hold max(0, homeAllocation -
  // consumed); the claw-back is its excess above that. Idempotent — a seat
  // already at/below target (fixed by a prior run, empty-origin, or manually)
  // yields ~0 and is skipped, so re-running is safe without knowing which seats
  // were fixed. `consumed` is Metronome's OWN per-user usage (authoritative, not
  // ES); the claw-back floors at 0, so it can only under-correct, never add
  // credit or touch a healthy seat (a legit seat has balance ≈ allocation -
  // consumed, so its excess is ~0).
  const RECONCILE_TOLERANCE_AWU = 1000;
  const affectedSeatIds = [...strayInfoBySeat.keys()];
  const consumedByUserId = await fetchConsumedAwuCreditsFromMetronomeByUserId({
    workspaceId,
    metronomeCustomerId,
    metronomeContractId: contractId,
    users: affectedSeatIds.map((sId) => ({
      sId,
      seatType: seatTypeBySeatId.get(sId) ?? null,
    })),
  });
  const corrections: SeatCorrection[] = [];
  for (const seatId of affectedSeatIds) {
    const info = strayInfoBySeat.get(seatId);
    if (!info) {
      continue;
    }
    const homeAllocation = allocationBySeatType.get(info.homeSeatType) ?? 0;
    const consumedAwu = consumedByUserId.get(seatId) ?? 0;
    const currentBalance = awuBalanceBySeatId.get(seatId) ?? 0;
    const targetBalance = Math.max(0, homeAllocation - consumedAwu);
    const clawBackAwu = Math.max(0, currentBalance - targetBalance);
    if (clawBackAwu <= RECONCILE_TOLERANCE_AWU) {
      continue;
    }
    corrections.push({
      seatId,
      homeSeatType: info.homeSeatType,
      strayType: info.strayType,
      homeAllocation,
      consumedAwu,
      currentBalance,
      targetBalance,
      clawBackAwu,
      creditId: info.creditId,
      segmentId: info.segmentId,
      adjustmentTimestamp: info.adjustmentTimestamp,
    });
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
      // Seats on a credit-bearing tier considered, before the reconcile filter
      // keeps only those over target.
      candidateSeatCount: strayInfoBySeat.size,
      seatsWithConsumption: consumedByUserId.size,
      correctedSeatCount: corrections.length,
      totalClawBackAwu: corrections.reduce((s, c) => s + c.clawBackAwu, 0),
      batchedAdjustCalls: batches.size,
      byTransition: Object.fromEntries(byTransition),
      skippedAmbiguousStrayTiers: [...skippedAmbiguousStray],
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
