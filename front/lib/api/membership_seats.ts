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
 * The immediate-vs-deferred decision for a seat change MUST go through
 * `classifySeatChange` (unless `immediate` is set): assignments and upgrades
 * (allocation gained/kept) apply immediately, while downgrades and seat removals
 * that carried an allowance are deferred to the previous seat's next credit
 * renewal. This is the single source of truth for seat-change timing, shared by
 * the members admin path (`updateMembershipSeatAndTrack`) and group-driven seat
 * provisioning (`GroupResource.recomputeAndSyncWorkspaceSeatsForUsers`). It does
 * NOT emit audit events, reconcile Metronome, run the direct sync, or enforce the
 * free-plan guard (a paid seat requires a non-free plan) — those are the caller's
 * responsibility (see `metronomeBilled`/`seatChanged`). The free-plan guard lives
 * in `updateMembershipSeatAndTrack` (the group-sync path only reaches this core
 * for Metronome seat-billed workspaces, which are never on a free plan).
 *
 * Applies a membership seat-type change to the database and reports what
 * happened, without any audit/tracking/Metronome side effects. `immediate`
 * forces an in-place change (skipping the deferral classifier);
 * `allowReturningMemberFreeSeat` bypasses the one-shot `free` guard for
 * admin-driven overrides.
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

  // Outside of Metronome billing we just write the DB straight through —
  // no scheduling logic applies.
  if (!workspace.metronomeCustomerId) {
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

  const contract = await getActiveContract(workspace.sId);
  const hasSeatSubscription = contract
    ? await hasContractSeatSubscription(contract)
    : false;
  if (!contract || !hasSeatSubscription) {
    // Workspace is on Metronome but the active contract has no seat
    // subscription — apply the DB change without touching Metronome.
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

  const productSeatTypes = await getProductSeatTypes();
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
