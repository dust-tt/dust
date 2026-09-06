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
 * Detection + correction are EXACT and per-credit. The seat-balances read
 * (`include_credits_and_commits`) returns, for each seat, a `credits[]` array
 * with that seat's balance on EACH individual credit id (not just the aggregate
 * per credit type). We map each materialized credit id to its seat type once per
 * contract (via `findSeatCreditSegmentForPeriod` per credit-bearing tier, whose
 * `creditId` is the materialized id), then for each seat empty exactly the
 * credits whose seat type ≠ the seat's CURRENT tier. The negative delta equals
 * that seat's own per-seat balance on the stray credit, driving it to 0.
 *
 * This is inherently IDEMPOTENT: a re-run reads the stray credit's per-seat
 * balance as 0 and emits nothing. No consumption estimate, no allocation
 * matching, no same-family ambiguity — the credit id itself names the stray
 * tier, so a pro-vs-pro_yearly collision is never a question. All corrections on
 * the same stray credit share its segment start as their entry time, so they
 * apply in ONE batched ledger entry per stray credit (write cost is O(stray
 * credits)).
 *
 * A credit id that maps to no credit-bearing tier (the contract's "Excess" or
 * pool credit, or a tier we don't recognize) is left untouched — only credits
 * whose seat type is known AND differs from the seat's current tier are emptied.
 *
 * IMPORTANT — read before running with --execute:
 *
 *  - Emptying the stray credit's per-seat balance can leave THAT pool's slice at
 *    0 (never negative — we debit exactly the balance). Harmless for a seat no
 *    longer assigned to that tier: nothing draws from it and it expires next
 *    recurrence.
 *  - `--excludeSeatIds` still exists for belt-and-suspenders, but is not required
 *    for safety: an already-emptied seat reads 0 and is a no-op. Re-run the audit
 *    afterwards to confirm.
 *
 * NOTE: this corrects the CURRENT period only. Recurring credits are materialized
 * one period ahead, so a mid-period move also leaves a stray grant on the NEXT
 * segment (fixed at the source by `emptyOriginNextPeriodCredits` in seats.ts).
 * Re-run after that ships to clear any next-period backlog.
 *
 * Dry-run by default (prints the full plan, including per-seat credit/segment
 * resolution). Pass --execute to apply. Use --seatId to restrict to a single
 * seat (validate the mechanics on one before a bulk run), and --homeSeatType to
 * scope to seats currently of a given tier (e.g. only the confident `max` set).
 *
 * `--allWorkspaces` runs across every workspace that currently has a
 * max/max_yearly/pro_yearly seat (the only ones that can carry a stacked
 * credit), sequentially, dry-run unless --execute. No need to iterate all
 * workspaces — a plain pro-monthly workspace has no stray credit to empty.
 *
 *   npx tsx scripts/fix_metronome_stacked_seat_credits.ts --workspaceId <wId>
 *   npx tsx scripts/fix_metronome_stacked_seat_credits.ts --workspaceId <wId> --homeSeatType max --seatId <userId>
 *   npx tsx scripts/fix_metronome_stacked_seat_credits.ts --workspaceId <wId> --homeSeatType max --execute
 *   npx tsx scripts/fix_metronome_stacked_seat_credits.ts --allWorkspaces
 *   npx tsx scripts/fix_metronome_stacked_seat_credits.ts --allWorkspaces --execute
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
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import { getSeatCreditNameForSeatType } from "@app/lib/metronome/seats";
import { Op } from "@app/lib/resources/storage/data_types";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
import { normalizeError } from "@app/types/shared/utils/error_utils";

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

// A credit-bearing tier's recurring credit, resolved to its materialized credit
// id + segment for the current period.
interface TierCredit {
  seatType: MembershipSeatType;
  recurringCreditId: string;
  // Materialized credit id for the current segment (matches seat.credits[].id).
  creditId: string;
  segmentId: string;
  // Shared, in-segment entry time so all seats on this credit batch into one
  // ledger write.
  adjustmentTimestamp: Date;
}

interface SeatCorrection {
  seatId: string;
  // The seat's current (home) tier.
  homeSeatType: MembershipSeatType;
  // Seat type of the stray credit being emptied (named by the credit id itself).
  strayType: MembershipSeatType;
  // The seat's exact per-seat balance on the stray credit — debited in full so
  // the pool slice lands on 0.
  strayBalanceAwu: number;
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
  const recurringCreditByTier = new Map<
    MembershipSeatType,
    { subscriptionId: string; recurringCreditId: string }
  >();
  for (const [seatType, sub] of seatSubscriptions) {
    if (!sub.id || !getSeatCreditNameForSeatType(seatType)) {
      continue;
    }
    const recurringCredit = (contract.recurring_credits ?? []).find(
      (c) => c.subscription_config?.subscription_id === sub.id
    );
    if (recurringCredit?.id) {
      recurringCreditByTier.set(seatType, {
        subscriptionId: sub.id,
        recurringCreditId: recurringCredit.id,
      });
    }
  }

  // Resolve each credit-bearing tier's recurring credit to its MATERIALIZED
  // credit id + segment for the current period, and index BY that credit id.
  // findSeatCreditSegmentForPeriod returns the materialized credit id (the same
  // id seats carry in `credits[].id`), which is what names the stray tier below:
  // a credit id whose tier ≠ the seat's current tier is stray, no matter which
  // family it belongs to (so pro-vs-pro_yearly is never ambiguous).
  const tierByCreditId = new Map<string, TierCredit>();
  for (const [seatType, { recurringCreditId }] of recurringCreditByTier) {
    const segRes = await paceMetronome(() =>
      findSeatCreditSegmentForPeriod({
        metronomeCustomerId,
        metronomeContractId: contractId,
        recurringCreditId,
      })
    );
    if (segRes.isErr()) {
      logger.error(
        { workspaceId, seatType, err: segRes.error.message },
        "[StackedFix] failed to resolve seat credit segment for tier"
      );
      return;
    }
    const segment = segRes.value;
    if (!segment) {
      logger.warn(
        { workspaceId, seatType, recurringCreditId },
        "[StackedFix] no active seat credit segment for tier — skipping tier"
      );
      continue;
    }
    tierByCreditId.set(segment.creditId, {
      seatType,
      recurringCreditId,
      creditId: segment.creditId,
      segmentId: segment.segmentId,
      // Shared, in-segment entry time so all seats on this credit batch.
      adjustmentTimestamp: new Date(segment.segmentStartingAt),
    });
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

  // Candidate seats: currently on a credit-bearing tier (a free/none home has no
  // recurring credit of its own; its stray is handled separately). Apply the CLI
  // filters here.
  const candidates: Array<{
    seatId: string;
    homeSeatType: MembershipSeatType;
  }> = [];
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
    if (!recurringCreditByTier.has(homeSeatType)) {
      continue;
    }
    candidates.push({ seatId, homeSeatType });
  }

  // Read per-seat, per-credit balances for the candidate seats. `credits[]` is
  // populated by `include_credits_and_commits` and gives each seat's balance on
  // each individual credit id — the aggregate `balances[]` cannot distinguish a
  // seat's pro slice from its max slice.
  const awuCreditTypeId = getCreditTypeAwuId();
  const balancesRes = await paceMetronome(() =>
    listMetronomeSeatBalances({
      metronomeCustomerId,
      metronomeContractId: contractId,
      seatIds: candidates.map((c) => c.seatId),
    })
  );
  if (balancesRes.isErr()) {
    logger.error(
      { workspaceId, err: balancesRes.error.message },
      "[StackedFix] failed to read seat balances"
    );
    return;
  }
  // seatId -> [{ creditId, balanceAwu }] for AWU credits only.
  const seatCreditsBySeatId = new Map<
    string,
    Array<{ creditId: string; balanceAwu: number }>
  >();
  for (const seat of balancesRes.value) {
    seatCreditsBySeatId.set(
      seat.seat_id,
      (seat.credits ?? [])
        .filter((c) => c.credit_type_id === awuCreditTypeId)
        .map((c) => ({ creditId: c.id, balanceAwu: c.balance }))
    );
  }

  // For each candidate seat, empty exactly the credits whose seat type differs
  // from the seat's current tier. A credit id absent from `tierByCreditId`
  // (excess/pool/unrecognized) is left untouched, and a stray already at 0
  // (prior run / empty-origin) is a no-op — so re-runs are idempotent.
  const corrections: SeatCorrection[] = [];
  for (const { seatId, homeSeatType } of candidates) {
    const seatCredits = seatCreditsBySeatId.get(seatId) ?? [];
    for (const { creditId, balanceAwu } of seatCredits) {
      const tier = tierByCreditId.get(creditId);
      if (!tier || tier.seatType === homeSeatType || balanceAwu <= 0) {
        continue;
      }
      corrections.push({
        seatId,
        homeSeatType,
        strayType: tier.seatType,
        strayBalanceAwu: balanceAwu,
        creditId: tier.creditId,
        segmentId: tier.segmentId,
        adjustmentTimestamp: tier.adjustmentTimestamp,
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
    agg.totalAwu += c.strayBalanceAwu;
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
      candidateSeatCount: candidates.length,
      correctedSeatCount: corrections.length,
      totalEmptiedAwu: corrections.reduce((s, c) => s + c.strayBalanceAwu, 0),
      batchedAdjustCalls: batches.size,
      byTransition: Object.fromEntries(byTransition),
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
      batch.items.map((c) => [c.seatId, -c.strayBalanceAwu])
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
        totalAwu: batch.items.reduce((s, c) => s + c.strayBalanceAwu, 0),
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

// Only workspaces that CURRENTLY have at least one max / max_yearly / pro_yearly
// seat can carry a stacked credit: stacking is a pro->max (or yearly) upgrade
// that stranded the origin credit, so the affected seat is on the higher/yearly
// tier now. A plain pro-monthly-only workspace has no max credit to stray, so
// there is no need to iterate every workspace. Matches:
//   select distinct "workspaceId" from memberships
//   where "seatType" in ('max','max_yearly','pro_yearly')
const STACKED_RISK_SEAT_TYPES: MembershipSeatType[] = [
  "max",
  "max_yearly",
  "pro_yearly",
];

async function listStackedRiskWorkspaceIds(): Promise<string[]> {
  const rows = await MembershipModel.findAll({
    attributes: ["workspaceId"],
    where: { seatType: { [Op.in]: STACKED_RISK_SEAT_TYPES } },
    group: ["workspaceId"],
    raw: true,
  });
  const workspaces = await WorkspaceResource.fetchByModelIds(
    rows.map((r) => r.workspaceId)
  );
  return workspaces.map((w) => w.sId);
}

makeScript(
  {
    workspaceId: {
      type: "string",
      describe:
        "sId of a single workspace to correct. Omit and pass --allWorkspaces " +
        "to run across every at-risk workspace instead.",
    },
    allWorkspaces: {
      type: "boolean",
      default: false,
      describe:
        "Run on ALL workspaces that currently have at least one " +
        "max/max_yearly/pro_yearly seat (the only ones that can carry a " +
        "stacked credit). Processed sequentially; --seatId is ignored.",
    },
    seatId: {
      type: "string",
      describe:
        "Restrict to a single seat (userId) — validate the mechanics on one " +
        "before a bulk run. Single-workspace mode only.",
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
    {
      workspaceId,
      allWorkspaces,
      seatId,
      homeSeatType,
      excludeSeatIds,
      execute,
    },
    logger
  ) => {
    if (!config.getMetronomeApiKey()) {
      logger.error({}, "[StackedFix] METRONOME_API_KEY is not configured");
      return;
    }
    const sharedOptions = {
      execute,
      onlyHomeSeatType:
        (homeSeatType as MembershipSeatType | undefined) ?? null,
      excludeSeatIds: new Set(
        (excludeSeatIds ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      ),
      logger,
    };

    if (allWorkspaces) {
      if (seatId) {
        logger.warn(
          {},
          "[StackedFix] --seatId is ignored in --allWorkspaces mode"
        );
      }
      const workspaceIds = await listStackedRiskWorkspaceIds();
      logger.info(
        { workspaceCount: workspaceIds.length, execute },
        "[StackedFix] running across all at-risk workspaces (max/max_yearly/pro_yearly)"
      );
      // Sequential on purpose: the Metronome RPS pacer is process-global, and a
      // single workspace already fans out several paced calls — running
      // workspaces one at a time keeps request pressure and the DB connection
      // pool bounded. A per-workspace failure is logged and skipped, never
      // aborting the whole run.
      for (const [index, wId] of workspaceIds.entries()) {
        logger.info(
          { workspaceId: wId, index: index + 1, total: workspaceIds.length },
          "[StackedFix] processing workspace"
        );
        try {
          await fixWorkspace(wId, { ...sharedOptions, onlySeatId: null });
        } catch (err) {
          logger.error(
            { workspaceId: wId, err: normalizeError(err).message },
            "[StackedFix] workspace failed — skipping"
          );
        }
      }
      logger.info(
        { workspaceCount: workspaceIds.length, execute },
        "[StackedFix] all at-risk workspaces done"
      );
      return;
    }

    if (!workspaceId) {
      logger.error(
        {},
        "[StackedFix] provide --workspaceId <wId> or --allWorkspaces"
      );
      return;
    }
    await fixWorkspace(workspaceId, {
      ...sharedOptions,
      onlySeatId: seatId ?? null,
    });
  }
);
