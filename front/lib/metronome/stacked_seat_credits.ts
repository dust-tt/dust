import {
  adjustSeatCreditBalances,
  findSeatCreditSegmentForPeriod,
  invalidateCachedCustomerPerUserCreditBalances,
} from "@app/lib/metronome/client";
import type { ContractCreditType } from "@app/lib/metronome/constants";
import {
  CONTRACT_CREDIT_TYPE_EXCESS,
  CONTRACT_CREDIT_TYPE_FREE_SEAT,
  CONTRACT_CREDIT_TYPE_POOL,
  getCreditTypeAwuId,
} from "@app/lib/metronome/constants";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import {
  getAwuAllocationForSeatType,
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import { getSeatCreditNameForSeatType } from "@app/lib/metronome/seats";
import type { MetronomeSeatBalance } from "@app/lib/metronome/types";
import type { Logger } from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Shared detection + correction for "stacked" per-seat AWU credits: a seat that
 * holds a live balance on a per-seat recurring credit belonging to a DIFFERENT
 * seat type than the seat's current tier (e.g. a max seat still carrying the pro
 * credit after a pro→max upgrade stranded the origin grant).
 *
 * Both the backfill script (`fix_metronome_stacked_seat_credits.ts`) and the
 * `credit.segment.start`-triggered reconcile go through this module so detection
 * can never drift between the one-off cleanup and the ongoing guard.
 *
 * The key primitive is the per-seat `credits[]` breakdown on `MetronomeSeatBalance`
 * (populated with `include_credits_and_commits`): it gives each seat's balance on
 * each individual materialized credit id. We map each materialized credit id to a
 * seat type once per contract, then for each seat:
 *
 *  - empty every STRAY credit fully (a credit whose seat type ≠ the seat's tier);
 *  - drive the HOME credit to `max(0, homeAllocation − currentPeriodUsage)`, using
 *    Metronome's authoritative per-user AWU usage.
 *
 * The home step is what keeps the seat correct: consumption billed to a stray is
 * otherwise forgiven when the stray is emptied, leaving the seat over-credited by
 * that amount (a seat that spent 69 AWU against its stray would end at a full home
 * 8000 instead of 7931). Because the target is ABSOLUTE (allocation − usage) not a
 * relative debit, the whole pass is idempotent and self-correcting:
 *
 *  - a healthy seat is a no-op — its home already equals allocation − usage;
 *  - a partial Metronome failure (one credit's write lands, another doesn't) is
 *    just retried next run, never double-debiting;
 *  - it even RECOVERS a stray already emptied by an earlier no-carry run, whose
 *    consumption is no longer visible in any balance but is still in the usage
 *    figure — the home debit recomputes correctly from usage alone.
 *
 * Stray DETECTION stays exact/per-credit (the credit id names its tier, never
 * ambiguous); only the home target uses usage. Never adds credit and never drives
 * a slice negative (both the empty and the home target floor at 0).
 */

// A credit-bearing tier's recurring credit, resolved to its materialized credit
// id + segment for the current period.
interface TierCredit {
  seatType: MembershipSeatType;
  recurringCreditId: string;
  // Materialized credit id for the current segment (matches seat.credits[].id).
  creditId: string;
  segmentId: string;
  // Full per-seat allocation for the period (e.g. 8000 pro, 40000 max), used to
  // derive consumption as allocation − balance.
  allocation: number;
  // Shared, in-segment entry time so all seats on this credit batch into one
  // ledger write.
  adjustmentTimestamp: Date;
}

// One per-seat ledger delta on a specific seat credit. `empty_stray` zeroes a
// stray credit's slice; `carry_consumption` debits the home credit by the usage
// that had been charged to the seat's strays.
export interface SeatCreditAdjustment {
  seatId: string;
  homeSeatType: MembershipSeatType;
  // Seat type of the credit being adjusted (the stray's type for `empty_stray`,
  // the home type for `carry_consumption`).
  creditSeatType: MembershipSeatType;
  creditId: string;
  segmentId: string;
  adjustmentTimestamp: Date;
  // Negative: the amount debited from this seat's slice of the credit.
  deltaAwu: number;
  kind: "empty_stray" | "carry_consumption";
}

// Wraps each Metronome call so a bulk caller (the backfill script over ~200
// workspaces) can rate-limit; defaults to a passthrough for the single-workspace
// webhook path.
export type PaceFn = <T>(fn: () => Promise<T>) => Promise<T>;
const NO_PACING: PaceFn = (fn) => fn();

export interface StackedSeatCreditsSummary {
  // Adjustments detected (regardless of whether they were applied).
  adjustments: SeatCreditAdjustment[];
  emptiedStrayCount: number;
  carriedConsumptionCount: number;
  totalEmptiedAwu: number;
  totalCarriedAwu: number;
  // Set on execute: successful per-seat deltas applied and batched ledger writes.
  appliedAdjustmentCount: number;
  batchedAdjustCalls: number;
}

/**
 * Resolve each credit-bearing tier's recurring credit to its MATERIALIZED credit
 * id + segment (and per-seat allocation) for the current period, indexed BY that
 * credit id. `findSeatCreditSegmentForPeriod` returns the materialized credit id
 * (the same id seats carry in `credits[].id`), which is what names each credit's
 * tier: a credit id whose tier ≠ the seat's current tier is stray, regardless of
 * which family it belongs to (so pro-vs-pro_yearly is never ambiguous).
 */
export async function buildSeatCreditTierMap({
  metronomeCustomerId,
  metronomeContractId,
  contract,
  logger,
  pace = NO_PACING,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
  contract: CachedContract;
  logger: Logger;
  pace?: PaceFn;
}): Promise<Result<Map<string, TierCredit>, Error>> {
  const productSeatTypes = await getProductSeatTypes();
  const seatSubscriptions = getSeatSubscriptionsFromContract(
    contract,
    productSeatTypes
  );

  const tierByCreditId = new Map<string, TierCredit>();
  for (const [seatType, sub] of seatSubscriptions) {
    if (!sub.id || !getSeatCreditNameForSeatType(seatType)) {
      continue;
    }
    const recurringCredit = (contract.recurring_credits ?? []).find(
      (c) => c.subscription_config?.subscription_id === sub.id
    );
    if (!recurringCredit?.id) {
      continue;
    }
    const segRes = await pace(() =>
      findSeatCreditSegmentForPeriod({
        metronomeCustomerId,
        metronomeContractId,
        recurringCreditId: recurringCredit.id,
      })
    );
    if (segRes.isErr()) {
      return new Err(segRes.error);
    }
    const segment = segRes.value;
    if (!segment) {
      logger.warn(
        { seatType, recurringCreditId: recurringCredit.id },
        "[StackedSeatCredits] no active seat credit segment for tier — skipping tier"
      );
      continue;
    }
    tierByCreditId.set(segment.creditId, {
      seatType,
      recurringCreditId: recurringCredit.id,
      creditId: segment.creditId,
      segmentId: segment.segmentId,
      allocation: getAwuAllocationForSeatType(
        contract,
        seatType,
        productSeatTypes
      ),
      adjustmentTimestamp: new Date(segment.segmentStartingAt),
    });
  }
  return new Ok(tierByCreditId);
}

/**
 * Pure detection. For each seat, empty every stray seat credit fully and drive
 * the home credit to `max(0, homeAllocation − usage)`. A credit id absent from
 * `tierByCreditId` (excess/pool/unrecognized) is left untouched. Emits nothing for
 * a healthy seat (no stray, home already at its usage-based target), and — because
 * the home target is absolute — re-runs are idempotent and recover a seat whose
 * stray was already emptied without a carry.
 */
export function computeStackedSeatCreditAdjustments({
  seatBalances,
  currentSeatTypeBySeatId,
  tierByCreditId,
  usageBySeatId,
}: {
  seatBalances: MetronomeSeatBalance[];
  currentSeatTypeBySeatId: Map<string, MembershipSeatType>;
  tierByCreditId: Map<string, TierCredit>;
  // Current-period Metronome per-user AWU consumption (authoritative). Drives the
  // home credit to its correct balance; a missing entry is treated as 0 usage.
  usageBySeatId: Map<string, number>;
}): SeatCreditAdjustment[] {
  const awuCreditTypeId = getCreditTypeAwuId();
  const adjustments: SeatCreditAdjustment[] = [];

  for (const seat of seatBalances) {
    const homeSeatType = currentSeatTypeBySeatId.get(seat.seat_id);
    if (!homeSeatType) {
      continue;
    }

    // Resolve the seat's balance on each of its recognized seat-credit tiers.
    const mapped = (seat.credits ?? []).flatMap((c) => {
      if (c.credit_type_id !== awuCreditTypeId) {
        return [];
      }
      const tier = tierByCreditId.get(c.id);
      return tier ? [{ balanceAwu: c.balance, tier }] : [];
    });

    const strays = mapped.filter(
      (m) => m.tier.seatType !== homeSeatType && m.balanceAwu > 0
    );
    const home = mapped.find((m) => m.tier.seatType === homeSeatType) ?? null;

    // Empty every stray credit's slice for this seat.
    for (const stray of strays) {
      adjustments.push({
        seatId: seat.seat_id,
        homeSeatType,
        creditSeatType: stray.tier.seatType,
        creditId: stray.tier.creditId,
        segmentId: stray.tier.segmentId,
        adjustmentTimestamp: stray.tier.adjustmentTimestamp,
        deltaAwu: -stray.balanceAwu,
        kind: "empty_stray",
      });
    }

    // Drive the home credit to its correct balance: allocation − current-period
    // usage. This absolute, usage-based target is what makes the whole pass
    // idempotent and recovers consumption that leaked onto a stray — including a
    // stray already emptied by an earlier no-carry run, whose consumption is no
    // longer visible in any credit balance but is still in the usage figure. It
    // is a no-op for a healthy seat: its home balance already equals allocation −
    // usage, so the debit is 0. Never adds credit (debit floors at 0) and never
    // drives the home negative (target floors at 0). Skipped when the home credit
    // isn't present.
    if (home) {
      const usageAwu = usageBySeatId.get(seat.seat_id) ?? 0;
      const targetHomeBalanceAwu = Math.max(0, home.tier.allocation - usageAwu);
      const homeDebit = home.balanceAwu - targetHomeBalanceAwu;
      if (homeDebit > 0) {
        adjustments.push({
          seatId: seat.seat_id,
          homeSeatType,
          creditSeatType: home.tier.seatType,
          creditId: home.tier.creditId,
          segmentId: home.tier.segmentId,
          adjustmentTimestamp: home.tier.adjustmentTimestamp,
          deltaAwu: -homeDebit,
          kind: "carry_consumption",
        });
      }
    }
  }

  return adjustments;
}

/**
 * Apply seat-credit adjustments, batched into ONE ledger write per (credit,
 * segment) with a per-seat delta map. No-op when there is nothing to apply; a
 * per-batch failure is logged and skipped.
 *
 * No cross-credit ordering or gating is needed: the stray empty targets 0 and the
 * home carry targets an ABSOLUTE usage-based balance (allocation − usage), so both
 * are idempotent. A partial failure (one credit's batch fails, another succeeds)
 * is simply retried on the next run — the home debit recomputes to 0 once the home
 * already sits at its target, so a user is never double-debited.
 */
async function applyStackedSeatCreditAdjustments({
  workspaceId,
  metronomeCustomerId,
  metronomeContractId,
  adjustments,
  logger,
  pace = NO_PACING,
}: {
  workspaceId: string;
  metronomeCustomerId: string;
  metronomeContractId: string;
  adjustments: SeatCreditAdjustment[];
  logger: Logger;
  pace?: PaceFn;
}): Promise<{ appliedAdjustmentCount: number; batchedAdjustCalls: number }> {
  const batches = new Map<
    string,
    {
      creditId: string;
      segmentId: string;
      creditSeatType: MembershipSeatType;
      timestamp: Date;
      // Sum of per-seat deltas (a seat appears at most once per credit, summed
      // defensively).
      perSeatAmounts: Map<string, number>;
    }
  >();
  for (const a of adjustments) {
    const key = `${a.creditId}:${a.segmentId}`;
    const batch = batches.get(key) ?? {
      creditId: a.creditId,
      segmentId: a.segmentId,
      creditSeatType: a.creditSeatType,
      timestamp: a.adjustmentTimestamp,
      perSeatAmounts: new Map<string, number>(),
    };
    batch.perSeatAmounts.set(
      a.seatId,
      (batch.perSeatAmounts.get(a.seatId) ?? 0) + a.deltaAwu
    );
    batches.set(key, batch);
  }

  let appliedAdjustmentCount = 0;
  let batchedAdjustCalls = 0;
  for (const batch of batches.values()) {
    const perSeatAmounts = Object.fromEntries(batch.perSeatAmounts);
    const adjustRes = await pace(() =>
      adjustSeatCreditBalances({
        metronomeCustomerId,
        metronomeContractId,
        creditId: batch.creditId,
        segmentId: batch.segmentId,
        perSeatAmounts,
        reason: `Stacked-credit correction on ${batch.creditSeatType} seat credit (empty stray / carry consumption)`,
        timestamp: batch.timestamp,
        alignToHour: false,
      })
    );
    if (adjustRes.isErr()) {
      logger.error(
        {
          workspaceId,
          creditSeatType: batch.creditSeatType,
          creditId: batch.creditId,
          seatCount: batch.perSeatAmounts.size,
          err: adjustRes.error.message,
        },
        "[StackedSeatCredits] batched correction failed"
      );
      continue;
    }
    batchedAdjustCalls += 1;
    appliedAdjustmentCount += batch.perSeatAmounts.size;
    logger.info(
      {
        workspaceId,
        creditSeatType: batch.creditSeatType,
        creditId: batch.creditId,
        seatCount: batch.perSeatAmounts.size,
        totalAwu: [...batch.perSeatAmounts.values()].reduce((s, d) => s + d, 0),
        timestamp: batch.timestamp.toISOString(),
      },
      "[StackedSeatCredits] applied batched correction"
    );
  }
  return { appliedAdjustmentCount, batchedAdjustCalls };
}

function summarizeAdjustments(
  adjustments: SeatCreditAdjustment[]
): Pick<
  StackedSeatCreditsSummary,
  | "emptiedStrayCount"
  | "carriedConsumptionCount"
  | "totalEmptiedAwu"
  | "totalCarriedAwu"
> {
  let emptiedStrayCount = 0;
  let carriedConsumptionCount = 0;
  let totalEmptiedAwu = 0;
  let totalCarriedAwu = 0;
  for (const a of adjustments) {
    if (a.kind === "empty_stray") {
      emptiedStrayCount += 1;
      totalEmptiedAwu += -a.deltaAwu;
    } else {
      carriedConsumptionCount += 1;
      totalCarriedAwu += -a.deltaAwu;
    }
  }
  return {
    emptiedStrayCount,
    carriedConsumptionCount,
    totalEmptiedAwu,
    totalCarriedAwu,
  };
}

/**
 * Detect and (when `execute`) correct stacked seat credits for a workspace,
 * given per-seat balances already read once by the caller (with `credits[]`) and
 * each seat's current tier. Single entry point for both the backfill script and
 * the webhook reconcile.
 *
 * On execute, after applying it busts the per-user credit-balance Redis caches
 * (free-seat/pool/excess) — a manual ledger entry does NOT fire the Metronome
 * webhook that normally invalidates them, so nothing else clears them.
 */
export async function correctStackedSeatCreditsFromBalances({
  workspaceId,
  metronomeCustomerId,
  metronomeContractId,
  contract,
  seatBalances,
  currentSeatTypeBySeatId,
  usageBySeatId,
  execute,
  logger,
  pace = NO_PACING,
}: {
  workspaceId: string;
  metronomeCustomerId: string;
  metronomeContractId: string;
  contract: CachedContract;
  seatBalances: MetronomeSeatBalance[];
  currentSeatTypeBySeatId: Map<string, MembershipSeatType>;
  usageBySeatId: Map<string, number>;
  execute: boolean;
  logger: Logger;
  pace?: PaceFn;
}): Promise<Result<StackedSeatCreditsSummary, Error>> {
  const tierMapRes = await buildSeatCreditTierMap({
    metronomeCustomerId,
    metronomeContractId,
    contract,
    logger,
    pace,
  });
  if (tierMapRes.isErr()) {
    return new Err(tierMapRes.error);
  }
  const adjustments = computeStackedSeatCreditAdjustments({
    seatBalances,
    currentSeatTypeBySeatId,
    tierByCreditId: tierMapRes.value,
    usageBySeatId,
  });
  const totals = summarizeAdjustments(adjustments);

  if (!execute || adjustments.length === 0) {
    return new Ok({
      adjustments,
      ...totals,
      appliedAdjustmentCount: 0,
      batchedAdjustCalls: 0,
    });
  }

  const { appliedAdjustmentCount, batchedAdjustCalls } =
    await applyStackedSeatCreditAdjustments({
      workspaceId,
      metronomeCustomerId,
      metronomeContractId,
      adjustments,
      logger,
      pace,
    });

  if (appliedAdjustmentCount > 0) {
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
      "[StackedSeatCredits] invalidated cached per-user credit balances"
    );
  }

  return new Ok({
    adjustments,
    ...totals,
    appliedAdjustmentCount,
    batchedAdjustCalls,
  });
}
