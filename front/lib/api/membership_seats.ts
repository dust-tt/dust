import { getActiveContract } from "@app/lib/metronome/plan_type";
import { getProductSeatTypes } from "@app/lib/metronome/seat_types";
import {
  classifySeatChange,
  hasContractSeatSubscription,
} from "@app/lib/metronome/seats";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import logger from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType, UserType } from "@app/types/user";

export type ApplyMembershipSeatChangeError = {
  type:
    | "not_found"
    | "free_seat_not_allowed"
    | "seat_limit_reached"
    | "metronome_error";
};

// Resolved Metronome seat-billing context for a workspace: the active contract
// and the product seat-type catalog. `null` means the workspace does not bill
// seats through Metronome (no `metronomeCustomerId`, no active contract, or a
// contract with no seat subscription) — seat changes then write straight through
// without any scheduling.
type MetronomeSeatContext = {
  contract: NonNullable<Awaited<ReturnType<typeof getActiveContract>>>;
  productSeatTypes: Awaited<ReturnType<typeof getProductSeatTypes>>;
};

async function resolveMetronomeSeatContext(
  workspace: LightWorkspaceType
): Promise<MetronomeSeatContext | null> {
  if (!workspace.metronomeCustomerId) {
    return null;
  }
  const contract = await getActiveContract(workspace.sId);
  const hasSeatSubscription = contract
    ? await hasContractSeatSubscription(contract)
    : false;
  if (!contract || !hasSeatSubscription) {
    return null;
  }
  const productSeatTypes = await getProductSeatTypes();
  return { contract, productSeatTypes };
}

export type ApplyMembershipSeatChangeResult = {
  previousSeatType: MembershipSeatType;
  // The user's active seat type after the DB write: `newSeatType` for an
  // immediate change, `previousSeatType` when the change was deferred, a no-op,
  // or a cancellation.
  resultingActiveSeatType: MembershipSeatType;
  // Set when the change was deferred to the end of the current period.
  scheduledSeatChangeAt: Date | undefined;
  // Whether the workspace bills seats through Metronome (an active contract with
  // a seat subscription). When true the caller MUST reconcile the Metronome seat
  // count after the write (via `launchMetronomeSeatCountSyncWorkflow`). False for
  // the non-Metronome and no-seat-subscription short-circuits.
  metronomeBilled: boolean;
  // Whether the DB seat state changed (immediate move, scheduled deferral, or
  // cancellation of a pending change). Callers use it to skip a redundant
  // Metronome reconcile when nothing changed.
  seatChanged: boolean;
};

/**
 * @cc [owner:tdraier,label:product;backend] seat-change-timing
 * The immediate-vs-deferred timing of a seat change MUST be decided by
 * `classifySeatChange` (unless `immediate` is set). This core only writes the DB
 * and reports the outcome (`metronomeBilled`/`seatChanged`); it does NOT audit,
 * reconcile Metronome, or enforce the free-plan guard — the caller owns those.
 *
 * `immediate` forces an in-place change; `allowReturningMemberFreeSeat` bypasses
 * the one-shot `free` guard for admin overrides.
 */
export async function applyMembershipSeatChange({
  user,
  workspace,
  newSeatType,
  author,
  immediate = false,
  allowReturningMemberFreeSeat = false,
}: {
  user: UserResource;
  workspace: LightWorkspaceType;
  newSeatType: MembershipSeatType;
  author: UserType | "no-author";
  immediate?: boolean;
  allowReturningMemberFreeSeat?: boolean;
}): Promise<
  Result<ApplyMembershipSeatChangeResult, ApplyMembershipSeatChangeError>
> {
  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });
  if (!membership) {
    return new Err({ type: "not_found" });
  }

  const previousSeatType = membership.seatType;

  // `free` is a one-shot starter tier — only assignable when the user has never
  // held a real seat in this workspace. `none` is not a real seat: a user whose
  // active seat is `none` and who has no prior real-seat history is still
  // eligible for `free`. A free→free noop is unaffected.
  if (!allowReturningMemberFreeSeat) {
    if (newSeatType === "free" && previousSeatType === "none") {
      const hasPreviousMembership =
        await MembershipResource.hasAnyMembershipOfUserInWorkspace({
          user,
          workspace,
        });
      if (hasPreviousMembership) {
        return new Err({ type: "free_seat_not_allowed" });
      }
    } else if (newSeatType === "free" && previousSeatType !== "free") {
      return new Err({ type: "free_seat_not_allowed" });
    }
  }

  // Enforce the per-seat-type hard cap (`maxSeats`). Assigning to `none`
  // (removing a seat) is always allowed. Same-type noops are also allowed (no
  // net change). This cap is never bypassed — committed seat counts (`minSeats`)
  // are not enforced here, so exceeding the commitment is already permitted.
  if (newSeatType !== "none" && newSeatType !== previousSeatType) {
    const seatLimits = await WorkspaceSeatLimitResource.fetchByWorkspace({
      workspace,
    });
    const limit = seatLimits.get(newSeatType);
    if (limit?.maxSeats !== null && limit?.maxSeats !== undefined) {
      const seatCounts =
        await MembershipResource.getActiveSeatTypeCountsForWorkspace({
          workspace,
        });
      const currentCount = seatCounts[newSeatType] ?? 0;
      if (currentCount >= limit.maxSeats) {
        return new Err({ type: "seat_limit_reached" });
      }
    }
  }

  const scheduledRow =
    await MembershipResource.getScheduledMembershipOfUserInWorkspace({
      user,
      workspace,
    });

  const metronome = await resolveMetronomeSeatContext(workspace);

  return applyClassifiedSeatChange({
    user,
    workspace,
    author,
    membership,
    previousSeatType,
    newSeatType,
    scheduledRow,
    metronome,
    immediate,
  });
}

/**
 * @cc [owner:tdraier,label:product;backend] classified-seat-write
 * The immediate-vs-deferred timing MUST be decided by `classifySeatChange`
 * (unless `immediate` is set). This helper applies the change from its prefetched
 * inputs and reports the outcome; it does NOT audit, reconcile Metronome, or
 * enforce the free-plan / `maxSeats` guards — its callers own those. A null
 * `metronome` writes straight through with no scheduling.
 */
async function applyClassifiedSeatChange({
  user,
  workspace,
  author,
  membership,
  previousSeatType,
  newSeatType,
  scheduledRow,
  metronome,
  immediate,
}: {
  user: UserResource;
  workspace: LightWorkspaceType;
  author: UserType | "no-author";
  membership: MembershipResource;
  previousSeatType: MembershipSeatType;
  newSeatType: MembershipSeatType;
  scheduledRow: MembershipResource | null;
  metronome: MetronomeSeatContext | null;
  immediate: boolean;
}): Promise<
  Result<ApplyMembershipSeatChangeResult, ApplyMembershipSeatChangeError>
> {
  // Outside of Metronome billing we just write the DB straight through —
  // no scheduling logic applies.
  if (!metronome) {
    if (previousSeatType !== newSeatType) {
      await membership.updateMembershipSeat({
        user,
        workspace,
        newSeatType,
        author,
      });
    }
    return new Ok({
      previousSeatType,
      resultingActiveSeatType: newSeatType,
      scheduledSeatChangeAt: undefined,
      metronomeBilled: false,
      seatChanged: previousSeatType !== newSeatType,
    });
  }

  const { contract, productSeatTypes } = metronome;
  const outcome = immediate
    ? previousSeatType === newSeatType
      ? { kind: "noop" as const }
      : { kind: "immediate" as const }
    : classifySeatChange({
        contract,
        productSeatTypes,
        now: new Date(),
        change: {
          userId: user.sId,
          previousSeatType,
          newSeatType,
          pendingScheduledChange: scheduledRow
            ? { seatType: scheduledRow.seatType, at: scheduledRow.startAt }
            : undefined,
        },
      });
  if (!outcome) {
    logger.error(
      {
        workspaceId: workspace.sId,
        userId: user.sId,
        previousSeatType,
        newSeatType,
      },
      "[Metronome] Cannot defer seat transition — no next billing period on contract"
    );
    return new Err({ type: "metronome_error" });
  }

  // Apply the DB write. The caller reconciles Metronome afterwards
  // (`syncSeatCount` reads active + scheduled-future memberships).
  let scheduledSeatChangeAt: Date | undefined;
  let resultingActiveSeatType: MembershipSeatType = previousSeatType;
  let seatChanged = false;
  switch (outcome.kind) {
    case "noop":
      break;
    case "cancelled":
      await membership.cancelScheduledSeatChange({
        user,
        workspace,
        author,
        scheduledRow,
      });
      seatChanged = true;
      break;
    case "immediate":
      // Drop any pending future row first so `syncSeatCount` doesn't try
      // to reconcile a stale scheduled segment.
      if (scheduledRow) {
        await membership.cancelScheduledSeatChange({
          user,
          workspace,
          author,
          scheduledRow,
        });
      }
      await membership.updateMembershipSeat({
        user,
        workspace,
        newSeatType,
        author,
      });
      resultingActiveSeatType = newSeatType;
      seatChanged = true;
      break;
    case "deferred":
      // `scheduleSeatChange` already destroys any prior pending row.
      await membership.scheduleSeatChange({
        user,
        workspace,
        newSeatType,
        scheduledAt: outcome.at,
        author,
      });
      scheduledSeatChangeAt = outcome.at;
      seatChanged = true;
      break;
    default:
      return assertNever(outcome);
  }

  return new Ok({
    previousSeatType,
    resultingActiveSeatType,
    scheduledSeatChangeAt,
    metronomeBilled: true,
    seatChanged,
  });
}

export type ApplyMembershipSeatChangeForUser = {
  user: UserResource;
  result: Result<
    ApplyMembershipSeatChangeResult,
    ApplyMembershipSeatChangeError
  >;
};

// Batch entry point for applying many seat changes at once (the group-driven
// seat sync). It computes nothing about targets — each change's `newSeatType` is
// resolved by the caller — and reuses the same timing/write core as the
// single-user `applyMembershipSeatChange`, so per-member timing is identical.
// The decision inputs (active/scheduled memberships, seat limits, counts,
// Metronome context) are fetched once for the whole batch, not per member (see
// the `batch-database-queries` directory contract). Unlike the single path it
// does NOT enforce the one-shot `free` guard, so callers MUST NOT pass `free`.
/**
 * @cc [owner:tdraier,label:product] batch-seat-cap
 * The per-seat-type `maxSeats` cap MUST be enforced against a running count that
 * is updated as immediate changes are applied within the batch, so several
 * assignments to a capped tier in one batch cannot collectively exceed the cap.
 */
export async function applyMembershipSeatChangesForWorkspace({
  workspace,
  changes,
  author,
}: {
  workspace: LightWorkspaceType;
  changes: Array<{ user: UserResource; newSeatType: MembershipSeatType }>;
  author: UserType | "no-author";
}): Promise<ApplyMembershipSeatChangeForUser[]> {
  if (changes.length === 0) {
    return [];
  }

  const users = changes.map((c) => c.user);

  // One query each — no per-member reads in the loop below.
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
    users,
  });
  const membershipByUser = new Map(memberships.map((m) => [m.userId, m]));
  const scheduledByUser =
    await MembershipResource.getScheduledMembershipsByUserIdInWorkspace({
      workspace,
      userIds: users.map((u) => u.id),
    });
  const seatLimits = await WorkspaceSeatLimitResource.fetchByWorkspace({
    workspace,
  });
  // Running per-seat-type counts, updated as immediate changes are applied so the
  // `maxSeats` cap holds across the whole batch (not just against the initial
  // snapshot).
  const runningCounts: Partial<Record<MembershipSeatType, number>> = {
    ...(await MembershipResource.getActiveSeatTypeCountsForWorkspace({
      workspace,
    })),
  };
  const metronome = await resolveMetronomeSeatContext(workspace);

  const results: ApplyMembershipSeatChangeForUser[] = [];
  for (const { user, newSeatType } of changes) {
    const membership = membershipByUser.get(user.id);
    if (!membership) {
      results.push({ user, result: new Err({ type: "not_found" }) });
      continue;
    }
    const previousSeatType: MembershipSeatType = membership.seatType;

    // Enforce the per-seat-type hard cap (`maxSeats`) against the running count.
    // Removals (`none`) and same-type noops never consume a seat.
    if (newSeatType !== "none" && newSeatType !== previousSeatType) {
      const limit = seatLimits.get(newSeatType);
      if (limit?.maxSeats !== null && limit?.maxSeats !== undefined) {
        const currentCount = runningCounts[newSeatType] ?? 0;
        if (currentCount >= limit.maxSeats) {
          results.push({
            user,
            result: new Err({ type: "seat_limit_reached" }),
          });
          continue;
        }
      }
    }

    const result = await applyClassifiedSeatChange({
      user,
      workspace,
      author,
      membership,
      previousSeatType,
      newSeatType,
      scheduledRow: scheduledByUser.get(user.id) ?? null,
      metronome,
      immediate: false,
    });

    // Keep the running counts in sync with the active-seat change we just wrote
    // (immediate move or removal). Deferred changes and cancellations leave the
    // active count unchanged.
    if (result.isOk()) {
      const { resultingActiveSeatType } = result.value;
      if (resultingActiveSeatType !== previousSeatType) {
        if (previousSeatType !== "none") {
          runningCounts[previousSeatType] =
            (runningCounts[previousSeatType] ?? 0) - 1;
        }
        if (resultingActiveSeatType !== "none") {
          runningCounts[resultingActiveSeatType] =
            (runningCounts[resultingActiveSeatType] ?? 0) + 1;
        }
      }
    }

    results.push({ user, result });
  }

  return results;
}
