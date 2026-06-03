import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  emitAuditLogEventDirect,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { AuditLogActor } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getAwuAllocationForSeatType,
  getDefaultSeatTypeForContract,
  getProductSeatTypes,
} from "@app/lib/metronome/seat_types";
import {
  classifySeatChange,
  hasContractSeatSubscription,
} from "@app/lib/metronome/seats";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import {
  launchMetronomeSeatCountSyncWorkflow,
  launchUpdateUsageWorkflow,
} from "@app/temporal/usage_queue/client";
import type {
  MembershipOriginType,
  MembershipRoleType,
  MembershipSeatType,
  UserCreditState,
} from "@app/types/memberships";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  ActiveRoleType,
  LightWorkspaceType,
  UserType,
} from "@app/types/user";
import type { Transaction } from "sequelize";

/**
 * Resolve the seat type for a brand-new membership. For seat-billed
 * contracts, picks the lowest-allowance seat tier billed on the contract,
 * gated by the active plan's free-seat caps:
 *
 *  - Returning member (already had a row in this workspace) → `free` is
 *    skipped (one-shot starter tier).
 *  - `useFreeSeat` is false → caller opted out of `free` directly.
 *  - `plan.limits.users.maxFreeUsers` reached → `free` is skipped.
 *  - `plan.limits.users.maxLifetimeFreeUsers` reached → `free` is skipped.
 *
 * In all three skip cases the resolver advances to the next billed tier
 * and only fails when no tier is assignable.
 *
 * The workspace-wide active-member cap (`plan.limits.users.maxUsers`) is
 * NOT checked here — it's enforced upstream by
 * `evaluateWorkspaceSeatAvailability` (signup) and `invitation.ts` (invite
 * creation).
 *
 * Also resolves the new member's initial per-user credit state: `user_seat`
 * when the resolved seat tier carries personal (seat) AWU credits, so a
 * seat-based member starts spending their own credits immediately rather than
 * waiting for the next billing-cycle reset; `on_pool` otherwise.
 *
 * Returns `seatType: undefined` for workspaces not on Metronome billing (the
 * caller passes it to `createMembership`, which applies its built-in default)
 * and `creditState: "on_pool"` — the pooled baseline.
 */
async function resolveSeatTypeForNewMembership(
  user: UserResource,
  workspace: LightWorkspaceType,
  { useFreeSeat = true }: { useFreeSeat?: boolean } = {}
): Promise<{
  seatType: MembershipSeatType | undefined;
  creditState: UserCreditState;
}> {
  if (!workspace.metronomeCustomerId) {
    return { seatType: undefined, creditState: "on_pool" };
  }
  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  if (!subscription?.metronomeContractId) {
    return { seatType: undefined, creditState: "on_pool" };
  }
  const contract = await getActiveContract(workspace.sId);
  if (!contract) {
    return { seatType: undefined, creditState: "on_pool" };
  }
  const planLimits = subscription.toJSON().plan.limits.users;
  // `isReturningMember` is always queried — the one-shot rule (`free`
  // cannot be re-granted to a user who already had a membership) holds
  // independently of any configured cap. `freeSeatCounts` is only needed
  // when at least one of the two caps is set; skip the count queries
  // otherwise.
  const limitsActive =
    planLimits.maxFreeUsers !== -1 || planLimits.maxLifetimeFreeUsers !== -1;
  const [productSeatTypes, isReturningMember, freeSeatCounts] =
    await Promise.all([
      getProductSeatTypes(),
      MembershipResource.hasAnyMembershipOfUserInWorkspace({ user, workspace }),
      limitsActive
        ? MembershipResource.getFreeSeatCounts({ workspace })
        : Promise.resolve(undefined),
    ]);
  const defaultSeatType = getDefaultSeatTypeForContract(
    contract,
    productSeatTypes,
    {
      isReturningMember,
      useFreeSeat,
      freeSeatCounts,
      freeSeatLimits: {
        maxActiveFreeUsers: planLimits.maxFreeUsers,
        maxLifetimeFreeUsers: planLimits.maxLifetimeFreeUsers,
      },
    }
  );
  if (!defaultSeatType) {
    throw new Error(
      `Cannot resolve a seat type for user ${user.sId} in workspace ${workspace.sId}: contract has seat subscriptions but no tier is assignable${isReturningMember ? " (returning user; `free` is one-shot)" : ""}.`
    );
  }
  // A seat tier with a personal AWU allocation starts the member on
  // `user_seat`; tiers without one (and pooled workspaces) start on `on_pool`.
  const seatAwuAllocation = getAwuAllocationForSeatType(
    contract,
    defaultSeatType,
    productSeatTypes
  );
  return {
    seatType: defaultSeatType,
    creditState: seatAwuAllocation > 0 ? "user_seat" : "on_pool",
  };
}

/**
 * Create a membership with tracking, audit logging, and Metronome seat provisioning.
 *
 * For Metronome-billed workspaces with a seat-billed contract, the seat
 * type assigned to the new membership is the lowest-allowance tier billed
 * on the contract (with `free` skipped for returning members, when
 * `useFreeSeat` is false, or when the plan's free-seat caps are hit).
 * Refuses to create the row when no tier is assignable.
 *
 * `useFreeSeat` (default `true`) lets the caller opt the new member out
 * of `free` even when it would otherwise be available — e.g. an admin
 * provisioning a new member directly onto a paid tier.
 */
export async function createAndTrackMembership({
  user,
  workspace,
  role,
  origin,
  useFreeSeat = true,
  auditActor,
}: {
  user: UserResource;
  workspace: WorkspaceResource | WorkspaceModel | LightWorkspaceType;
  role: ActiveRoleType;
  origin: MembershipOriginType;
  useFreeSeat?: boolean;
  // Override for the audit-log actor. Defaults to the user themselves, which
  // is correct for self-signup. SCIM/system-driven provisioning should pass
  // `{ type: "system", id: directoryId, name: "Directory Sync" }` so the
  // audit row doesn't read like the user provisioned themselves.
  auditActor?: AuditLogActor;
}) {
  const w =
    workspace instanceof WorkspaceModel ||
    workspace instanceof WorkspaceResource
      ? renderLightWorkspaceType({ workspace })
      : workspace;

  const { seatType, creditState } = await resolveSeatTypeForNewMembership(
    user,
    w,
    { useFreeSeat }
  );

  const m = await MembershipResource.createMembership({
    role,
    user,
    workspace: w,
    origin,
    seatType,
    creditState,
  });

  void ServerSideTracking.trackCreateMembership({
    user: user.toJSON(),
    workspace: w,
    role: m.role,
    startAt: m.startAt,
  });

  void emitAuditLogEventDirect({
    workspace: w,
    action: "membership.created",
    actor: auditActor ?? {
      type: "user",
      id: user.sId,
      name: user.fullName() ?? "unknown",
    },
    targets: [
      buildAuditLogTarget("workspace", w),
      buildAuditLogTarget("user", {
        sId: user.sId,
        name: user.fullName() ?? "unknown",
      }),
    ],
    context: { location: "internal" },
    metadata: {
      role,
      origin,
    },
  });

  // Update workspace subscription usage when a new user joins.
  await launchUpdateUsageWorkflow({ workspaceId: workspace.sId });

  // Add seat in Metronome if workspace is Metronome-billed.
  const addSeatResult = await launchMetronomeSeatCountSyncWorkflow({
    workspaceId: w.sId,
  });
  if (addSeatResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        userId: user.sId,
        error: addSeatResult.error,
      },
      "[Metronome] Failed to add seat for new member"
    );
  }

  return m;
}

export async function revokeAndTrackMembership(
  auth: Authenticator,
  user: UserResource,
  {
    transaction,
    allowLastAdminRevocation = false,
    auditActor,
  }: {
    transaction?: Transaction;
    allowLastAdminRevocation?: boolean;
    // Override for the audit-log actor. When omitted, the actor is derived
    // from `auth` (typically a generic system actor when called from SCIM,
    // since auth is internalAdminForWorkspace). SCIM callers should pass
    // `{ type: "system", id: directoryId, name: "Directory Sync" }` so the
    // audit row identifies which directory triggered the revocation.
    auditActor?: AuditLogActor;
  } = {}
) {
  const workspace = auth.getNonNullableWorkspace();

  const revokeResult = await MembershipResource.revokeMembership({
    user,
    workspace,
    transaction,
    allowLastAdminRevocation,
  });

  if (revokeResult.isOk()) {
    const deleteTriggerResult = await TriggerResource.deleteAllForUser(
      auth,
      user
    );
    if (deleteTriggerResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          userId: user.sId,
          error: deleteTriggerResult.error,
        },
        "Failed to delete triggers for revoked user"
      );
    }

    await launchUpdateUsageWorkflow({ workspaceId: workspace.sId });
    void ServerSideTracking.trackRevokeMembership({
      user: user.toJSON(),
      workspace,
      role: revokeResult.value.role,
      startAt: revokeResult.value.startAt,
      endAt: revokeResult.value.endAt,
    });

    if (auditActor) {
      void emitAuditLogEventDirect({
        workspace,
        action: "membership.revoked",
        actor: auditActor,
        targets: [
          buildAuditLogTarget("workspace", workspace),
          buildAuditLogTarget("user", {
            sId: user.sId,
            name: user.fullName() ?? "unknown",
          }),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          previous_role: revokeResult.value.role,
        },
      });
    } else {
      void emitAuditLogEvent({
        auth,
        action: "membership.revoked",
        targets: [
          buildAuditLogTarget("workspace", workspace),
          buildAuditLogTarget("user", {
            sId: user.sId,
            name: user.fullName() ?? "unknown",
          }),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          previous_role: revokeResult.value.role,
        },
      });
    }

    // Remove seat in Metronome if workspace is Metronome-billed.
    const removeSeatResult = await launchMetronomeSeatCountSyncWorkflow({
      workspaceId: workspace.sId,
    });
    if (removeSeatResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          userId: user.sId,
          error: removeSeatResult.error,
        },
        "[Metronome] Failed to remove seat for revoked member"
      );
    }
  }

  return revokeResult;
}

/**
 * Update a membership role with tracking and Metronome seat provisioning.
 * If the membership was revoked and is being re-activated (allowTerminated),
 * automatically adds a Metronome seat.
 */
export async function updateMembershipRoleAndTrack({
  user,
  workspace,
  newRole,
  allowTerminated = false,
  allowLastAdminRemoval = false,
  author,
}: {
  user: UserResource;
  workspace: LightWorkspaceType;
  newRole: Exclude<MembershipRoleType, "revoked">;
  allowTerminated?: boolean;
  allowLastAdminRemoval?: boolean;
  author: UserType | "no-author";
}): Promise<
  Result<
    { previousRole: MembershipRoleType; newRole: MembershipRoleType },
    {
      type:
        | "not_found"
        | "already_on_role"
        | "membership_already_terminated"
        | "last_admin";
    }
  >
> {
  // Check if the membership is currently revoked (for seat provisioning after re-activation).
  let wasRevoked = false;
  if (allowTerminated) {
    const currentMembership =
      await MembershipResource.getLatestMembershipOfUserInWorkspace({
        user,
        workspace,
      });
    wasRevoked = currentMembership?.isRevoked() ?? false;
  }

  const updateRes = await MembershipResource.updateMembershipRole({
    user,
    workspace,
    newRole,
    allowTerminated,
    allowLastAdminRemoval,
    author,
  });

  if (updateRes.isOk()) {
    void ServerSideTracking.trackUpdateMembershipRole({
      user: user.toJSON(),
      workspace,
      previousRole: updateRes.value.previousRole,
      role: updateRes.value.newRole,
    });

    // If a revoked membership was re-activated, add a Metronome seat and update usage.
    if (wasRevoked) {
      const addSeatResult = await launchMetronomeSeatCountSyncWorkflow({
        workspaceId: workspace.sId,
      });
      if (addSeatResult.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            userId: user.sId,
            error: addSeatResult.error,
          },
          "[Metronome] Failed to add seat for re-activated member"
        );
      }
      await launchUpdateUsageWorkflow({ workspaceId: workspace.sId });
    }
  }

  return updateRes;
}

/**
 * Update a membership's seat type and re-sync Metronome accordingly. All
 * Metronome state changes (including scheduling decisions) flow through
 * `syncSeatCount`, which classifies the transition generically based on
 * allocation comparison — no per-seat-type policy lives here.
 *
 * Outcome from `syncSeatCount` drives the DB write:
 * - `immediate`: update the active membership row in place.
 * - `deferred`: close the active row at the scheduled date and insert a
 *   future row that takes effect at that date.
 * - `cancelled`: drop any DB future row and reopen the active one.
 * - `noop`: nothing to write.
 */
export async function updateMembershipSeatAndTrack({
  user,
  workspace,
  newSeatType,
  author,
}: {
  user: UserResource;
  workspace: LightWorkspaceType;
  newSeatType: MembershipSeatType;
  author: UserType | "no-author";
}): Promise<
  Result<
    {
      previousSeatType: MembershipSeatType;
      newSeatType: MembershipSeatType;
      scheduledSeatChangeAt: Date | undefined;
    },
    { type: "not_found" | "metronome_error" | "free_seat_not_allowed" }
  >
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

  // `free` is a one-shot starter tier — only assignable when creating a
  // user's first membership in the workspace. Any subsequent change to
  // free is rejected, even for users who previously held a free seat
  // (no twice-free). A free→free noop is unaffected: nothing is written.
  if (newSeatType === "free" && previousSeatType !== "free") {
    return new Err({ type: "free_seat_not_allowed" });
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
      newSeatType,
      scheduledSeatChangeAt: undefined,
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
      newSeatType,
      scheduledSeatChangeAt: undefined,
    });
  }

  const productSeatTypes = await getProductSeatTypes();
  const outcome = classifySeatChange({
    contract,
    productSeatTypes,
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

  // Apply the DB write *before* syncing Metronome. `syncSeatCount` reads
  // active + scheduled-future memberships and reconciles Metronome to match
  // — no `change` plumbing required.
  let scheduledSeatChangeAt: Date | undefined;
  let resultingActiveSeatType: MembershipSeatType = previousSeatType;
  switch (outcome.kind) {
    case "noop":
      break;
    case "cancelled":
      await membership.cancelScheduledSeatChange({ user, workspace, author });
      break;
    case "immediate":
      // Drop any pending future row first so `syncSeatCount` doesn't try
      // to reconcile a stale scheduled segment.
      if (scheduledRow) {
        await membership.cancelScheduledSeatChange({ user, workspace, author });
      }
      await membership.updateMembershipSeat({
        user,
        workspace,
        newSeatType,
        author,
      });
      resultingActiveSeatType = newSeatType;
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
      break;
    default:
      return assertNever(outcome);
  }

  const syncResult = await launchMetronomeSeatCountSyncWorkflow({
    workspaceId: workspace.sId,
  });
  if (syncResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        userId: user.sId,
        previousSeatType,
        newSeatType,
        error: syncResult.error,
      },
      "[Metronome] Failed to sync seat count for transition"
    );
    return new Err({ type: "metronome_error" });
  }

  return new Ok({
    previousSeatType,
    newSeatType: resultingActiveSeatType,
    scheduledSeatChangeAt,
  });
}
