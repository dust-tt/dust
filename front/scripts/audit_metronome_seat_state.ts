/**
 * Read-only audit of a workspace's seat state: compares what Dust believes
 * (DB membership seat types) against what Metronome actually holds (assigned
 * seat IDs + unassigned pool per seat subscription) and the per-user seat
 * credit balances.
 *
 * Written to diagnose the seat-sync loop on workspaces where `syncSeatCount`
 * keeps re-issuing the same seat edit because some users desired in Dust never
 * land in Metronome's assigned set (so the reconcile never converges). It
 * surfaces exactly which users are missing / stale per seat type, and each
 * assigned seat's live balance, so we can figure out why they won't assign
 * before touching credit state.
 *
 * Purely diagnostic — makes only READ calls to Metronome and the DB. There is
 * nothing to --execute; it always just reports.
 *
 *   npx tsx scripts/audit_metronome_seat_state.ts --workspaceId <wId>
 */
import config from "@app/lib/api/config";
import {
  getMetronomeClient,
  getMetronomeSubscriptionSeatState,
  listMetronomeSeatBalances,
} from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getAwuAllocationForSeatType,
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import { makeScript } from "./helpers";

// Metronome publishes an 11 RPS API limit. Stay well under it so an audit run
// never adds rate-limit pressure to production traffic on the same key.
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

const setDiff = (a: string[], b: Set<string>): string[] =>
  a.filter((x) => !b.has(x));

// Raw shape of the (untyped) getSubscriptionSeatsHistory endpoint — the same
// one `getMetronomeSubscriptionSeatState` wraps. Fetched directly here so we
// can see EVERY segment (not just the resolved one) and verify how the read
// picks a segment when a future scheduled floor change adds extra segments.
interface RawSeatsHistoryResponse {
  data: Array<{
    starting_at: string;
    ending_before?: string | null;
    assigned_seat_ids: string[];
    total_quantity?: string;
  }>;
}

async function fetchRawSeatSegments({
  metronomeCustomerId,
  contractId,
  subscriptionId,
  coveringDate,
}: {
  metronomeCustomerId: string;
  contractId: string;
  subscriptionId: string;
  coveringDate: Date;
}): Promise<
  Array<{
    startingAt: string;
    endingBefore: string | null;
    assignedCount: number;
    totalQuantity: number | null;
    unassigned: number | null;
  }>
> {
  const response = await getMetronomeClient().post<RawSeatsHistoryResponse>(
    "/v1/contracts/getSubscriptionSeatsHistory",
    {
      body: {
        customer_id: metronomeCustomerId,
        contract_id: contractId,
        subscription_id: subscriptionId,
        covering_date: coveringDate.toISOString(),
      },
    }
  );
  return (response.data ?? []).map((seg) => {
    const assignedCount = seg.assigned_seat_ids?.length ?? 0;
    const total = Number(seg.total_quantity);
    const totalQuantity = Number.isFinite(total) ? total : null;
    return {
      startingAt: seg.starting_at,
      endingBefore: seg.ending_before ?? null,
      assignedCount,
      totalQuantity,
      unassigned: totalQuantity === null ? null : totalQuantity - assignedCount,
    };
  });
}

// Probe one subscription at several covering dates spanning the scheduled
// floor changes, and dump the raw segments — to confirm (or refute) that the
// scheduled future minSeats change is what makes the "now" read unstable.
async function probeSubscriptionSegments({
  metronomeCustomerId,
  contractId,
  subId,
  seatType,
  scheduleSegments,
  workspaceId,
  logger,
}: {
  metronomeCustomerId: string;
  contractId: string;
  subId: string;
  seatType: MembershipSeatType;
  scheduleSegments: Array<{
    startAt: Date;
    endAt: Date | null;
    minSeats: number;
  }>;
  workspaceId: string;
  logger: Logger;
}): Promise<void> {
  const now = new Date();

  // Covering dates: now + every schedule boundary (start/end) that is in the
  // future, plus a point clearly after the last boundary. These are exactly the
  // moments `syncSeatCount` reconciles as distinct segments.
  const boundaryMs = new Set<number>([now.getTime()]);
  let maxFutureMs = now.getTime();
  for (const seg of scheduleSegments) {
    for (const d of [seg.startAt, seg.endAt]) {
      if (d && d.getTime() > now.getTime()) {
        boundaryMs.add(d.getTime());
        maxFutureMs = Math.max(maxFutureMs, d.getTime());
      }
    }
  }
  if (maxFutureMs > now.getTime()) {
    // One day past the last boundary, to read the terminal segment.
    boundaryMs.add(maxFutureMs + 24 * 60 * 60 * 1000);
  }
  const coveringDates = [...boundaryMs]
    .sort((a, b) => a - b)
    .map((ms) => new Date(ms));

  logger.info(
    {
      workspaceId,
      seatType,
      subscriptionId: subId,
      scheduledFloors: scheduleSegments.map((s) => ({
        minSeats: s.minSeats,
        startAt: s.startAt.toISOString(),
        endAt: s.endAt?.toISOString() ?? null,
      })),
    },
    "[SeatAudit] probe: seat-limit schedule"
  );

  // What `getMetronomeSubscriptionSeatState` (the code path syncSeatCount uses)
  // resolves at each covering date.
  for (const coveringDate of coveringDates) {
    const res = await paceMetronome(() =>
      getMetronomeSubscriptionSeatState({
        metronomeCustomerId,
        contractId,
        subscriptionId: subId,
        coveringDate,
      })
    );
    if (res.isErr()) {
      logger.error(
        {
          workspaceId,
          seatType,
          coveringDate: coveringDate.toISOString(),
          err: res.error.message,
        },
        "[SeatAudit] probe: getMetronomeSubscriptionSeatState failed"
      );
      continue;
    }
    logger.info(
      {
        workspaceId,
        seatType,
        subscriptionId: subId,
        coveringDate: coveringDate.toISOString(),
        resolvedAssigned: res.value.assignedSeatIds.length,
        resolvedUnassigned: res.value.unassignedSeats,
      },
      "[SeatAudit] probe: resolved seat state (as syncSeatCount reads it)"
    );
  }

  // Raw segments as returned at covering_date=now and at the far-future point —
  // shows whether multiple segments coexist and what `data[data.length - 1]`
  // (the entry the resolver picks) actually is.
  for (const coveringDate of [
    now,
    new Date(maxFutureMs + 24 * 60 * 60 * 1000),
  ]) {
    try {
      const segments = await paceMetronome(() =>
        fetchRawSeatSegments({
          metronomeCustomerId,
          contractId,
          subscriptionId: subId,
          coveringDate,
        })
      );
      logger.info(
        {
          workspaceId,
          seatType,
          subscriptionId: subId,
          coveringDate: coveringDate.toISOString(),
          segmentCount: segments.length,
          // The resolver takes the LAST entry — highlight it.
          lastSegment: segments[segments.length - 1] ?? null,
          segments,
        },
        "[SeatAudit] probe: raw seat-history segments"
      );
    } catch (err) {
      logger.error(
        {
          workspaceId,
          seatType,
          coveringDate: coveringDate.toISOString(),
          err: normalizeError(err).message,
        },
        "[SeatAudit] probe: raw seat-history fetch failed"
      );
    }
  }
}

async function auditWorkspace(
  workspaceId: string,
  probe: boolean,
  logger: Logger
) {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.error({ workspaceId }, "[SeatAudit] workspace not found");
    return;
  }
  const lightWorkspace = renderLightWorkspaceType({ workspace });
  const { metronomeCustomerId } = lightWorkspace;
  if (!metronomeCustomerId) {
    logger.error(
      { workspaceId },
      "[SeatAudit] workspace is not provisioned on Metronome"
    );
    return;
  }

  const activeSubscription =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
  const contractId = activeSubscription?.metronomeContractId ?? null;
  if (!contractId) {
    logger.error(
      { workspaceId, metronomeCustomerId },
      "[SeatAudit] no active Metronome contract on the subscription"
    );
    return;
  }
  const planCode = activeSubscription?.getPlan().code ?? null;

  const contract = await getActiveContract(workspaceId);
  if (!contract) {
    logger.error(
      { workspaceId, contractId },
      "[SeatAudit] could not resolve the active contract from Metronome"
    );
    return;
  }

  // Metronome side: entitled seat subscriptions on the active contract.
  const productSeatTypes = await getProductSeatTypes();
  const seatSubscriptions = [
    ...getSeatSubscriptionsFromContract(contract, productSeatTypes),
  ].flatMap(([seatType, sub]) => (sub.id ? [{ seatType, subId: sub.id }] : []));

  // Dust side: DB membership seat types. Match the billed set exactly (see
  // syncSeatCount) — active window open AND firstUsedAt set. Provisioned-but-
  // never-used members are excluded from billing, so report them separately.
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace: lightWorkspace,
  });
  const desiredBySeatType = new Map<MembershipSeatType, Set<string>>();
  const provisionedUnusedBySeatType = new Map<MembershipSeatType, string[]>();
  for (const m of memberships) {
    const userSId = m.user?.sId;
    if (!userSId) {
      continue;
    }
    if (m.firstUsedAt === null) {
      const bucket = provisionedUnusedBySeatType.get(m.seatType) ?? [];
      bucket.push(userSId);
      provisionedUnusedBySeatType.set(m.seatType, bucket);
      continue;
    }
    const set = desiredBySeatType.get(m.seatType) ?? new Set<string>();
    set.add(userSId);
    desiredBySeatType.set(m.seatType, set);
  }

  logger.info(
    {
      workspaceId,
      metronomeCustomerId,
      contractId,
      planCode,
      seatSubscriptions: seatSubscriptions.map((s) => s.seatType),
      dustDesiredCounts: Object.fromEntries(
        [...desiredBySeatType].map(([t, s]) => [t, s.size])
      ),
      dustProvisionedUnusedCounts: Object.fromEntries(
        [...provisionedUnusedBySeatType].map(([t, s]) => [t, s.length])
      ),
    },
    "[SeatAudit] context"
  );

  const allSeatIds = new Set<string>();
  // Map every assigned seat to its seat type, and each seat type to the AWU
  // it is entitled to grant, so we can flag seats holding MORE granted AWU
  // than their allocation (credit stacking left by an un-emptied origin credit
  // on a prior seat-type change — e.g. a pro 8000 grant stacked on max 40000).
  const seatTypeBySeatId = new Map<string, MembershipSeatType>();
  const allocationBySeatType = new Map<MembershipSeatType, number>();
  for (const { seatType } of seatSubscriptions) {
    allocationBySeatType.set(
      seatType,
      getAwuAllocationForSeatType(contract, seatType, productSeatTypes)
    );
  }

  // Per seat subscription: compare Metronome assignment vs Dust desired.
  for (const { seatType, subId } of seatSubscriptions) {
    const stateRes = await paceMetronome(() =>
      getMetronomeSubscriptionSeatState({
        metronomeCustomerId,
        contractId,
        subscriptionId: subId,
      })
    );
    if (stateRes.isErr()) {
      logger.error(
        { workspaceId, seatType, subId, err: stateRes.error.message },
        "[SeatAudit] failed to read Metronome seat state"
      );
      continue;
    }
    const { assignedSeatIds, unassignedSeats } = stateRes.value;
    const assignedSet = new Set(assignedSeatIds);
    const desired = desiredBySeatType.get(seatType) ?? new Set<string>();

    const missingInMetronome = setDiff([...desired], assignedSet);
    const staleInMetronome = setDiff(assignedSeatIds, desired);

    assignedSeatIds.forEach((id) => {
      allSeatIds.add(id);
      seatTypeBySeatId.set(id, seatType);
    });
    desired.forEach((id) => allSeatIds.add(id));

    logger.info(
      {
        workspaceId,
        seatType,
        subscriptionId: subId,
        metronomeAssigned: assignedSeatIds.length,
        metronomeUnassigned: unassignedSeats,
        metronomeTotal: assignedSeatIds.length + unassignedSeats,
        dustDesired: desired.size,
        missingInMetronomeCount: missingInMetronome.length,
        staleInMetronomeCount: staleInMetronome.length,
        // The actual users that keep the reconcile from converging.
        missingInMetronome,
        staleInMetronome,
      },
      "[SeatAudit] seat subscription diff"
    );
  }

  // Per-user seat credit balances for every seat id we saw (assigned or
  // desired). Flags seats with no balance row and non-positive balances.
  const balancesRes = await paceMetronome(() =>
    listMetronomeSeatBalances({
      metronomeCustomerId,
      metronomeContractId: contractId,
      seatIds: [...allSeatIds],
    })
  );
  if (balancesRes.isErr()) {
    logger.error(
      { workspaceId, err: balancesRes.error.message },
      "[SeatAudit] failed to read seat balances"
    );
    return;
  }
  const awuCreditTypeId = getCreditTypeAwuId();
  const balanceBySeatId = new Map(
    balancesRes.value.map((b) => [b.seat_id, b.balances])
  );

  const seatsWithoutBalance: string[] = [];
  const seatsNonPositiveBalance: Array<{ seatId: string; awuBalance: number }> =
    [];
  for (const seatId of allSeatIds) {
    const balances = balanceBySeatId.get(seatId);
    if (!balances) {
      seatsWithoutBalance.push(seatId);
      continue;
    }
    const awu = balances.find((b) => b.credit_type_id === awuCreditTypeId);
    if (awu && awu.balance <= 0) {
      seatsNonPositiveBalance.push({ seatId, awuBalance: awu.balance });
    }
  }

  logger.info(
    {
      workspaceId,
      contractId,
      seatIdsChecked: allSeatIds.size,
      seatsWithBalance: balanceBySeatId.size,
      seatsWithoutBalanceCount: seatsWithoutBalance.length,
      seatsWithoutBalance,
      seatsNonPositiveBalanceCount: seatsNonPositiveBalance.length,
      seatsNonPositiveBalance,
    },
    "[SeatAudit] seat balances summary"
  );

  // Over-allocation (credit-stacking) detection. `starting_balance` is the
  // total AWU granted to the seat this cycle, independent of how much has been
  // consumed — so a seat granted MORE than its seat-type allocation is holding
  // a leftover grant that a prior seat-type change never emptied (the pro→max
  // stacking: 40000 max allocation + an orphaned 8000 pro grant =
  // starting_balance 48000). This is the exact population `syncSeatCount` can
  // no longer self-heal (empty-origin sees the user already converged on the
  // new seat), so it needs a targeted credit correction.
  //
  // A seat's AWU may be split across MULTIPLE balance entries (one per recurring
  // credit — e.g. a stacked seat with a separate pro and max entry), so SUM all
  // AWU-type entries rather than taking the first. `awuEntryCount` is emitted as
  // a diagnostic: if some stacked seats show 2 entries, the split shape is real;
  // if a fully-consumed stray grant is dropped by Metronome (single entry with
  // starting_balance back at the allocation), starting_balance-based detection
  // undercounts and we need a usage-based pass instead.
  const AWU_OVER_ALLOCATION_TOLERANCE = 1;
  const awuEntryCountHistogram = new Map<number, number>();
  const overAllocatedSeats: Array<{
    seatId: string;
    seatType: MembershipSeatType;
    allocation: number;
    startingBalance: number;
    currentBalance: number;
    overGrantedAwu: number;
    awuEntryCount: number;
  }> = [];
  for (const [seatId, seatType] of seatTypeBySeatId) {
    const allocation = allocationBySeatType.get(seatType);
    if (allocation === undefined || allocation <= 0) {
      continue;
    }
    const awuEntries = (balanceBySeatId.get(seatId) ?? []).filter(
      (b) => b.credit_type_id === awuCreditTypeId
    );
    awuEntryCountHistogram.set(
      awuEntries.length,
      (awuEntryCountHistogram.get(awuEntries.length) ?? 0) + 1
    );
    if (awuEntries.length === 0) {
      continue;
    }
    const startingBalance = awuEntries.reduce(
      (sum, b) => sum + b.starting_balance,
      0
    );
    const currentBalance = awuEntries.reduce((sum, b) => sum + b.balance, 0);
    const overGrantedAwu = startingBalance - allocation;
    if (overGrantedAwu > AWU_OVER_ALLOCATION_TOLERANCE) {
      overAllocatedSeats.push({
        seatId,
        seatType,
        allocation,
        startingBalance,
        currentBalance,
        overGrantedAwu,
        awuEntryCount: awuEntries.length,
      });
    }
  }
  overAllocatedSeats.sort((a, b) => b.overGrantedAwu - a.overGrantedAwu);
  const totalOverGrantedAwu = overAllocatedSeats.reduce(
    (sum, s) => sum + s.overGrantedAwu,
    0
  );
  logger.info(
    {
      workspaceId,
      contractId,
      allocationBySeatType: Object.fromEntries(allocationBySeatType),
      // How many AWU balance entries seats carry: >1 means the split (stacked)
      // shape exists and summing catches it; all 1s means fully-consumed stray
      // grants are dropped and starting_balance detection undercounts.
      awuEntryCountHistogram: Object.fromEntries(awuEntryCountHistogram),
      overAllocatedSeatCount: overAllocatedSeats.length,
      totalOverGrantedAwu,
      overAllocatedSeats,
    },
    "[SeatAudit] over-allocated seats (credit stacking)"
  );

  if (!probe) {
    return;
  }

  // Segment probe: read each subscription at multiple covering dates and dump
  // the raw seat-history segments, to confirm the scheduled future floor change
  // is what destabilizes the "now" unassigned read.
  const seatLimitSchedule =
    await WorkspaceSeatLimitResource.fetchScheduleByWorkspace({
      workspace: lightWorkspace,
    });
  for (const { seatType, subId } of seatSubscriptions) {
    await probeSubscriptionSegments({
      metronomeCustomerId,
      contractId,
      subId,
      seatType,
      scheduleSegments: seatLimitSchedule.get(seatType) ?? [],
      workspaceId,
      logger,
    });
  }
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      describe: "sId of the workspace to audit",
    },
    probe: {
      type: "boolean",
      default: false,
      describe:
        "Also probe each subscription at multiple covering dates and dump raw " +
        "seat-history segments (to inspect scheduled future floor changes)",
    },
  },
  async ({ workspaceId, probe }, logger) => {
    if (!config.getMetronomeApiKey()) {
      logger.error({}, "[SeatAudit] METRONOME_API_KEY is not configured");
      return;
    }
    await auditWorkspace(workspaceId, probe, logger);
  }
);
