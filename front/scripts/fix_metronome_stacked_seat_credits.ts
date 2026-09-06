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
 * Detection + correction are EXACT and per-credit, and live in the shared
 * `lib/metronome/stacked_seat_credits` core (also used by the
 * `credit.segment.start` webhook reconcile, so the two can never drift). The
 * seat-balances read (`include_credits_and_commits`) returns, for each seat, a
 * `credits[]` array with that seat's balance on EACH individual credit id (not
 * just the aggregate per credit type). We map each materialized credit id to its
 * seat type once per contract (via `findSeatCreditSegmentForPeriod` per
 * credit-bearing tier, whose `creditId` is the materialized id), then for each
 * seat:
 *
 *  - empty every STRAY credit (seat type ≠ the seat's current tier) fully, and
 *  - carry the consumption those strays absorbed onto the HOME credit — debiting
 *    it by `min(homeBalance, Σ strayConsumed)` — so the seat nets
 *    `homeAllocation − totalConsumed` instead of a full home allowance plus the
 *    stray usage forgiven. (Without the carry a seat that spent, say, 69 AWU
 *    against its stray would end at a full home 8000 instead of 7931.)
 *
 * Both figures are exact (observed per-seat balances vs. deterministic tier
 * allocations, not an ES estimate) and inherently IDEMPOTENT: a re-run reads
 * every stray at 0, so there is no stray consumption left to carry and nothing
 * is emitted. No allocation matching, no same-family ambiguity — the credit id
 * itself names each credit's tier, so a pro-vs-pro_yearly collision is never a
 * question. Deltas on the same credit batch into ONE ledger entry.
 *
 * A credit id that maps to no credit-bearing tier (the contract's "Excess" or
 * pool credit, or a tier we don't recognize) is left untouched.
 *
 * IMPORTANT — read before running with --execute:
 *
 *  - Debits never drive a slice negative (a stray is debited exactly its
 *    balance; the home carry is capped at the home balance). Harmless for a seat
 *    no longer assigned to a stray tier: nothing draws from it and it expires
 *    next recurrence.
 *  - `--excludeSeatIds` still exists for belt-and-suspenders, but is not required
 *    for safety: an already-corrected seat reads 0 strays and is a no-op. Re-run
 *    the audit afterwards to confirm.
 *
 * NOTE: this corrects the CURRENT period only. Recurring credits are materialized
 * one period ahead, so a mid-period move also leaves a stray grant on the NEXT
 * segment; the `credit.segment.start` webhook reconcile cleans each segment as it
 * becomes current, so a backfill re-run is only needed for the current period.
 *
 * Dry-run by default (prints the full plan, including every per-seat adjustment).
 * Pass --execute to apply. Use --seatId to restrict to a single seat (validate
 * the mechanics on one before a bulk run), and --homeSeatType to scope to seats
 * currently of a given tier (e.g. only the confident `max` set).
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
  getMetronomeSubscriptionSeatState,
  listMetronomeSeatBalances,
} from "@app/lib/metronome/client";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import { getSeatCreditNameForSeatType } from "@app/lib/metronome/seats";
import { correctStackedSeatCreditsFromBalances } from "@app/lib/metronome/stacked_seat_credits";
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

  // Credit-bearing tiers (pro/max families). `free`/`workspace`/`none` carry no
  // per-seat recurring credit (getSeatCreditNameForSeatType === null), so they
  // are never a valid home tier for a stacked seat here.
  const productSeatTypes = await getProductSeatTypes();
  const seatSubscriptions = [
    ...getSeatSubscriptionsFromContract(contract, productSeatTypes),
  ];
  const creditBearingHomeTypes = new Set<MembershipSeatType>();
  for (const [seatType, sub] of seatSubscriptions) {
    if (
      sub.id &&
      getSeatCreditNameForSeatType(seatType) &&
      (contract.recurring_credits ?? []).some(
        (c) => c.subscription_config?.subscription_id === sub.id
      )
    ) {
      creditBearingHomeTypes.add(seatType);
    }
  }

  // Map every assigned seat to its home (current) tier from Metronome's own
  // per-subscription assignment.
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
  // recurring credit of its own). Apply the CLI filters here.
  const currentSeatTypeBySeatId = new Map<string, MembershipSeatType>();
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
    if (!creditBearingHomeTypes.has(homeSeatType)) {
      continue;
    }
    currentSeatTypeBySeatId.set(seatId, homeSeatType);
  }

  // Read per-seat, per-credit balances once (credits[] via
  // include_credits_and_commits), then delegate detection + correction to the
  // shared core so the backfill and the webhook reconcile can never drift.
  const balancesRes = await paceMetronome(() =>
    listMetronomeSeatBalances({
      metronomeCustomerId,
      metronomeContractId: contractId,
      seatIds: [...currentSeatTypeBySeatId.keys()],
    })
  );
  if (balancesRes.isErr()) {
    logger.error(
      { workspaceId, err: balancesRes.error.message },
      "[StackedFix] failed to read seat balances"
    );
    return;
  }

  const result = await correctStackedSeatCreditsFromBalances({
    workspaceId,
    metronomeCustomerId,
    metronomeContractId: contractId,
    contract,
    seatBalances: balancesRes.value,
    currentSeatTypeBySeatId,
    execute,
    logger,
    pace: paceMetronome,
  });
  if (result.isErr()) {
    logger.error(
      { workspaceId, err: result.error.message },
      "[StackedFix] failed to correct stacked seat credits"
    );
    return;
  }
  const summary = result.value;

  logger.info(
    {
      workspaceId,
      contractId,
      execute,
      onlySeatId,
      onlyHomeSeatType,
      excludedSeatCount: excludeSeatIds.size,
      candidateSeatCount: currentSeatTypeBySeatId.size,
      emptiedStrayCount: summary.emptiedStrayCount,
      carriedConsumptionCount: summary.carriedConsumptionCount,
      totalEmptiedAwu: summary.totalEmptiedAwu,
      totalCarriedAwu: summary.totalCarriedAwu,
      batchedAdjustCalls: summary.batchedAdjustCalls,
      appliedAdjustmentCount: summary.appliedAdjustmentCount,
      adjustments: summary.adjustments,
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

  logger.info(
    {
      workspaceId,
      appliedAdjustmentCount: summary.appliedAdjustmentCount,
      batchedAdjustCalls: summary.batchedAdjustCalls,
    },
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
