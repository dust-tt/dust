import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  emitAuditLogEventDirect,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import { updateSubscriptionSeats } from "@app/lib/metronome/client";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getSubscriptionIdForSeatTypeFromContract,
  handleSeatTransition,
  hasContractSeatSubscription,
  syncSeatCount,
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
import { launchUpdateUsageWorkflow } from "@app/temporal/usage_queue/client";
import type {
  MembershipOriginType,
  MembershipRoleType,
  MembershipSeatType,
} from "@app/types/memberships";
import { Err, Ok, type Result } from "@app/types/shared/result";
import type {
  ActiveRoleType,
  LightWorkspaceType,
  UserType,
} from "@app/types/user";
import type { Transaction } from "sequelize";

async function syncSeatCountForWorkspace(
  workspace: LightWorkspaceType
): Promise<Result<void, Error>> {
  if (!workspace.metronomeCustomerId) {
    return new Ok(undefined);
  }
  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  if (!subscription?.metronomeContractId) {
    return new Ok(undefined);
  }

  const contract = await getActiveContract(workspace.sId);
  if (!contract) {
    return new Ok(undefined);
  }

  // Gate on seat subscription presence — contracts without a seat product (e.g. enterprise)
  // should not trigger a seat sync.
  if (!hasContractSeatSubscription(contract)) {
    return new Ok(undefined);
  }

  return await syncSeatCount({
    metronomeCustomerId: workspace.metronomeCustomerId,
    contractId: subscription.metronomeContractId,
    workspace,
    contract,
  });
}

/**
 * Create a membership with tracking, audit logging, and Metronome seat provisioning.
 */
export async function createAndTrackMembership({
  user,
  workspace,
  role,
  origin,
}: {
  user: UserResource;
  workspace: WorkspaceResource | WorkspaceModel | LightWorkspaceType;
  role: ActiveRoleType;
  origin: MembershipOriginType;
}) {
  const w =
    workspace instanceof WorkspaceModel ||
    workspace instanceof WorkspaceResource
      ? renderLightWorkspaceType({ workspace })
      : workspace;
  const m = await MembershipResource.createMembership({
    role,
    user,
    workspace: w,
    origin,
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
    actor: {
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
  const addSeatResult = await syncSeatCountForWorkspace(w);
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
  }: {
    transaction?: Transaction;
    allowLastAdminRevocation?: boolean;
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

    // Remove seat in Metronome if workspace is Metronome-billed.
    const removeSeatResult = await syncSeatCountForWorkspace(workspace);
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
      const addSeatResult = await syncSeatCountForWorkspace(workspace);
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
 * Schedules the inverse Metronome transition at the same future date, overriding
 * the previously scheduled downgrade. Returns Err if subscription IDs are missing.
 */
async function cancelScheduledDowngradeInMetronome({
  metronomeCustomerId,
  contractId,
  contract,
  currentSeatType,
  pendingDowngradeSeatType,
  pendingDowngradeAt,
  userId,
}: {
  metronomeCustomerId: string;
  contractId: string;
  contract: CachedContract;
  currentSeatType: MembershipSeatType;
  pendingDowngradeSeatType: MembershipSeatType;
  pendingDowngradeAt: Date;
  userId: string;
}): Promise<Result<void, Error>> {
  const fromSubId = getSubscriptionIdForSeatTypeFromContract(
    contract,
    pendingDowngradeSeatType
  );
  const toSubId = getSubscriptionIdForSeatTypeFromContract(
    contract,
    currentSeatType
  );
  if (!fromSubId || !toSubId) {
    return new Err(
      new Error(
        `Missing subscription IDs to cancel downgrade from ${pendingDowngradeSeatType} to ${currentSeatType}`
      )
    );
  }
  return updateSubscriptionSeats({
    metronomeCustomerId,
    contractId,
    fromSubscriptionId: fromSubId,
    toSubscriptionId: toSubId,
    addSeatIds: [userId],
    removeSeatIds: [userId],
    startingAt: pendingDowngradeAt.toISOString(),
  });
}

/**
 * Update a membership's seat type and re-sync Metronome seat counts.
 * Seat-based Metronome subscriptions (Pro / Max) bucket users by seat type,
 * so any change must trigger a seat-count sync.
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
      pendingDowngradeAt: Date | undefined;
    },
    { type: "not_found" | "membership_revoked" | "metronome_error" }
  >
> {
  const membership =
    await MembershipResource.getLatestMembershipOfUserInWorkspace({
      user,
      workspace,
    });
  if (!membership) {
    return new Err({ type: "not_found" });
  }
  if (membership.isRevoked()) {
    return new Err({ type: "membership_revoked" });
  }

  const previousSeatType = membership.seatType;

  let newPendingDowngradeSeatType: MembershipSeatType | null | undefined;
  let newPendingDowngradeAt: Date | null | undefined;

  if (workspace.metronomeCustomerId) {
    const subscription =
      await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
    const contract = await getActiveContract(workspace.sId);

    if (
      subscription?.metronomeContractId &&
      contract &&
      hasContractSeatSubscription(contract)
    ) {
      const metronomeCustomerId = workspace.metronomeCustomerId;
      const contractId = subscription.metronomeContractId;

      const transitionResult = await handleSeatTransition({
        metronomeCustomerId,
        contractId,
        contract,
        userId: user.sId,
        previousSeatType,
        newSeatType,
      });
      if (transitionResult.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            userId: user.sId,
            previousSeatType,
            newSeatType,
            error: transitionResult.error,
          },
          "[Metronome] Failed to handle seat transition"
        );
        return new Err({ type: "metronome_error" });
      }

      const scheduledDowngradeAt = transitionResult.value.pendingDowngradeAt;

      if (scheduledDowngradeAt) {
        newPendingDowngradeSeatType = newSeatType;
        newPendingDowngradeAt = scheduledDowngradeAt;
      } else if (
        membership.pendingDowngradeSeatType &&
        membership.pendingDowngradeAt
      ) {
        const cancelResult = await cancelScheduledDowngradeInMetronome({
          metronomeCustomerId,
          contractId,
          contract,
          currentSeatType: membership.seatType,
          pendingDowngradeSeatType: membership.pendingDowngradeSeatType,
          pendingDowngradeAt: membership.pendingDowngradeAt,
          userId: user.sId,
        });
        if (cancelResult.isErr()) {
          logger.error(
            {
              workspaceId: workspace.sId,
              userId: user.sId,
              error: cancelResult.error,
            },
            "[Metronome] Failed to cancel scheduled downgrade"
          );
          return new Err({ type: "metronome_error" });
        }
        newPendingDowngradeSeatType = null;
        newPendingDowngradeAt = null;
      }
    }
  }

  const dbSeatType =
    newPendingDowngradeAt instanceof Date ? previousSeatType : newSeatType;

  await membership.updateMembershipSeat({
    user,
    workspace,
    newSeatType: dbSeatType,
    author,
    newPendingDowngradeSeatType,
    newPendingDowngradeAt,
  });

  return new Ok({
    previousSeatType,
    newSeatType: dbSeatType,
    pendingDowngradeAt:
      newPendingDowngradeAt instanceof Date ? newPendingDowngradeAt : undefined,
  });
}
