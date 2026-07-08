import type {
  SeatBillingFrequency,
  SeatPlanResponseBody,
} from "@app/lib/api/credits/seat_plan";
import { getSeatPlan, SeatPlanError } from "@app/lib/api/credits/seat_plan";
import type { Authenticator } from "@app/lib/auth";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { SupportedCurrency } from "@app/types/currency";
import type { MembershipSeatType, PaidSeatType } from "@app/types/memberships";
import {
  isMembershipSeatType,
  isPaidSeatType,
  PAID_SEAT_TYPES,
  SEAT_TYPE_ORDER,
} from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { z } from "zod";

export const BulkSeatChangeTargetSeatTypeSchema = z.enum(PAID_SEAT_TYPES);

// How a member's transition to the target seat will be applied. Mirrors the
// backend classifier (`classifySeatChange` in lib/metronome/seats.ts):
// - `unchanged`: already on the target seat, nothing happens.
// - `immediate`: the change (and its billing impact) applies right away.
// - `deferred`: the change applies at the next credit refresh (downgrades and
//   monthly→yearly switches).
export type BulkSeatChangeMoveKind = "unchanged" | "immediate" | "deferred";

export type BulkSeatChangeMove = {
  fromSeatType: MembershipSeatType;
  // Display name of the source seat from the seat plan; null for seats that
  // have no plan entry (e.g. "none").
  fromSeatName: string | null;
  kind: BulkSeatChangeMoveKind;
  count: number;
};

// Per-seat-type assignment totals around the bulk change, for the summary
// table: how many members hold the seat now and once every move (immediate +
// deferred) has landed, against the committed pool size (`minSeats`, 0 when
// the seat type carries no commitment). Covers every billable seat type
// (free included); "none" is not a seat and never appears.
export type BulkSeatChangeSeatTotal = {
  seatType: MembershipSeatType;
  seatName: string;
  committedSeats: number;
  assignedBefore: number;
  assignedAfter: number;
};

export type BulkSeatChangePreview = {
  memberCount: number;
  targetSeatType: PaidSeatType;
  targetSeatName: string;
  currency: SupportedCurrency;
  moves: BulkSeatChangeMove[];
  seatTotals: BulkSeatChangeSeatTotal[];
  // Monthly-equivalent invoice delta (annual prices divided by 12) of the
  // changes applying right away vs. at the next credit refresh.
  immediateDeltaMonthlyCents: number;
  deferredDeltaMonthlyCents: number;
  // ISO date the deferred changes land on (start of the next billing period,
  // i.e. the current cycle's end). Null when there are no deferred moves or
  // the billing period couldn't be resolved.
  nextBillingPeriodAt: string | null;
};

export class BulkSeatChangePreviewError extends Error {
  constructor(
    readonly type: "seat_plan_unavailable" | "members_resolution_failed",
    readonly cause?: Error
  ) {
    super(type);
  }
}

// Monthly-equivalent price of a seat, to sum deltas across mixed billing
// cadences into a single "per month" figure.
function monthlyEquivalentCents(
  priceCents: number,
  billingFrequency: SeatBillingFrequency
): number {
  switch (billingFrequency) {
    case "weekly":
      return (priceCents * 52) / 12;
    case "monthly":
      return priceCents;
    case "quarterly":
      return priceCents / 3;
    case "annual":
      return priceCents / 12;
    default:
      return assertNever(billingFrequency);
  }
}

function classifyMove({
  fromSeatType,
  targetSeatType,
  seatPlans,
}: {
  fromSeatType: MembershipSeatType;
  targetSeatType: PaidSeatType;
  seatPlans: SeatPlanResponseBody;
}): BulkSeatChangeMoveKind {
  if (fromSeatType === targetSeatType) {
    return "unchanged";
  }
  // Mirrors `classifySeatChange`: a monthly paid seat committing to annual
  // billing is always deferred, even when the target tier is higher.
  const isMonthlyToYearlySwitch =
    isPaidSeatType(fromSeatType) &&
    !fromSeatType.endsWith("_yearly") &&
    targetSeatType.endsWith("_yearly");
  if (isMonthlyToYearlySwitch) {
    return "deferred";
  }
  const fromAwuCredits = seatPlans[fromSeatType]?.awuCredits ?? 0;
  const targetAwuCredits = seatPlans[targetSeatType]?.awuCredits ?? 0;
  return targetAwuCredits >= fromAwuCredits ? "immediate" : "deferred";
}

/**
 * Marginal monthly cost of applying the net per-seat-type headcount deltas on
 * top of the current assignment, accounting for committed-seat floors: a seat
 * type's billed quantity is `max(assigned, minSeats)` (the seat sync tops the
 * subscription up to the floor with unassigned seats), so moving a member into
 * a seat type with spare committed slots consumes an already-billed seat and
 * costs nothing, and dropping below the floor saves nothing.
 */
function billedDeltaMonthlyCents({
  assignedBySeatType,
  headcountDeltaBySeatType,
  seatPlans,
}: {
  assignedBySeatType: Map<MembershipSeatType, number>;
  headcountDeltaBySeatType: Map<MembershipSeatType, number>;
  seatPlans: SeatPlanResponseBody;
}): number {
  let totalCents = 0;
  for (const [seatType, delta] of headcountDeltaBySeatType) {
    const info = seatPlans[seatType];
    // Seat types without a plan entry ("none", legacy) carry no billing.
    if (!info || delta === 0) {
      continue;
    }
    const assigned = assignedBySeatType.get(seatType) ?? info.assignedCount;
    const billedBefore = Math.max(assigned, info.minSeats);
    const billedAfter = Math.max(assigned + delta, info.minSeats);
    totalCents +=
      (billedAfter - billedBefore) *
      monthlyEquivalentCents(info.priceCents, info.billingFrequency);
  }
  return totalCents;
}

/**
 * Compute the impact summary of moving `userIds` to `targetSeatType`: how many
 * members move from each seat type (and whether each move is immediate or
 * deferred to the next credit refresh), plus the monthly-equivalent invoice
 * delta. Prices come from the workspace seat plan, and the deltas account for
 * committed-seat floors (`minSeats`): only the change in each seat type's
 * billed quantity `max(assigned, minSeats)` costs or saves money. Deferred
 * changes are priced on top of the post-immediate assignment.
 */
export async function computeBulkSeatChangePreview(
  auth: Authenticator,
  {
    userIds,
    targetSeatType,
  }: {
    userIds: string[];
    targetSeatType: PaidSeatType;
  }
): Promise<Result<BulkSeatChangePreview, BulkSeatChangePreviewError>> {
  const workspace = auth.getNonNullableWorkspace();

  const seatPlanResult = await getSeatPlan(auth);
  if (seatPlanResult.isErr()) {
    return new Err(
      new BulkSeatChangePreviewError(
        "seat_plan_unavailable",
        seatPlanResult.error
      )
    );
  }
  const seatPlans = seatPlanResult.value;
  const targetInfo = seatPlans[targetSeatType];
  if (!targetInfo) {
    return new Err(
      new BulkSeatChangePreviewError(
        "seat_plan_unavailable",
        new SeatPlanError("not_configured")
      )
    );
  }

  const users = await UserResource.fetchByIds(userIds);
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
    users,
  });
  const seatTypeByUserModelId = new Map(
    memberships.map((m) => [m.userId, m.seatType])
  );

  const countByFromSeatType = new Map<MembershipSeatType, number>();
  for (const user of users) {
    const fromSeatType = seatTypeByUserModelId.get(user.id);
    if (fromSeatType === undefined) {
      // No active membership (revoked between selection and preview) — the
      // apply step will skip them too.
      continue;
    }
    countByFromSeatType.set(
      fromSeatType,
      (countByFromSeatType.get(fromSeatType) ?? 0) + 1
    );
  }

  // Classify the moves and accumulate the net headcount delta each phase
  // applies to each seat type (members leave their current type and join the
  // target type either immediately or at the next credit refresh).
  const moves: BulkSeatChangeMove[] = [];
  let memberCount = 0;
  const immediateHeadcountDeltas = new Map<MembershipSeatType, number>();
  const deferredHeadcountDeltas = new Map<MembershipSeatType, number>();
  for (const [fromSeatType, count] of countByFromSeatType) {
    memberCount += count;
    const kind = classifyMove({ fromSeatType, targetSeatType, seatPlans });
    moves.push({
      fromSeatType,
      fromSeatName: seatPlans[fromSeatType]?.name ?? null,
      kind,
      count,
    });
    if (kind === "unchanged") {
      continue;
    }
    const deltas =
      kind === "immediate" ? immediateHeadcountDeltas : deferredHeadcountDeltas;
    deltas.set(fromSeatType, (deltas.get(fromSeatType) ?? 0) - count);
    deltas.set(targetSeatType, (deltas.get(targetSeatType) ?? 0) + count);
  }

  const assignedBySeatType = new Map<MembershipSeatType, number>();
  for (const [seatType, info] of Object.entries(seatPlans)) {
    if (isMembershipSeatType(seatType)) {
      assignedBySeatType.set(seatType, info.assignedCount);
    }
  }

  // Per-seat-type totals before / after all changes have landed, restricted
  // to billable seat types (free included) that hold members or carry a
  // commitment. "none" never has a seat-plan entry so it can't appear here.
  const seatTotals: BulkSeatChangeSeatTotal[] = [];
  for (const [seatType, info] of Object.entries(seatPlans)) {
    if (!isMembershipSeatType(seatType)) {
      continue;
    }
    const assignedBefore = info.assignedCount;
    const assignedAfter =
      assignedBefore +
      (immediateHeadcountDeltas.get(seatType) ?? 0) +
      (deferredHeadcountDeltas.get(seatType) ?? 0);
    if (assignedBefore === 0 && assignedAfter === 0 && info.minSeats === 0) {
      continue;
    }
    seatTotals.push({
      seatType,
      seatName: info.name,
      committedSeats: info.minSeats,
      assignedBefore,
      assignedAfter,
    });
  }
  seatTotals.sort(
    (a, b) =>
      SEAT_TYPE_ORDER[a.seatType] - SEAT_TYPE_ORDER[b.seatType] ||
      a.seatType.localeCompare(b.seatType)
  );

  const immediateDeltaMonthlyCents = billedDeltaMonthlyCents({
    assignedBySeatType,
    headcountDeltaBySeatType: immediateHeadcountDeltas,
    seatPlans,
  });
  // Deferred changes land on an assignment that already includes the
  // immediate moves.
  for (const [seatType, delta] of immediateHeadcountDeltas) {
    assignedBySeatType.set(
      seatType,
      (assignedBySeatType.get(seatType) ?? 0) + delta
    );
  }
  const deferredDeltaMonthlyCents = billedDeltaMonthlyCents({
    assignedBySeatType,
    headcountDeltaBySeatType: deferredHeadcountDeltas,
    seatPlans,
  });

  // Resolve when the deferred changes will land. Degrades to null (the UI
  // then omits the date) rather than failing the whole preview.
  let nextBillingPeriodAt: string | null = null;
  if (moves.some((m) => m.kind === "deferred")) {
    const periodResult = await getCachedMetronomeCurrentBillingPeriod(
      workspace.sId
    );
    if (periodResult.isOk()) {
      nextBillingPeriodAt = periodResult.value?.cycleEnd.toISOString() ?? null;
    }
  }

  return new Ok({
    memberCount,
    targetSeatType,
    targetSeatName: targetInfo.name,
    currency: targetInfo.currency,
    moves: moves.toSorted((a, b) => b.count - a.count),
    seatTotals,
    immediateDeltaMonthlyCents: Math.round(immediateDeltaMonthlyCents),
    deferredDeltaMonthlyCents: Math.round(deferredDeltaMonthlyCents),
    nextBillingPeriodAt,
  });
}
