import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import { reconcileUser } from "@app/lib/api/metronome/reconcile_credit_state";
import { getUserForWorkspace } from "@app/lib/api/user";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import {
  clearMetronomePerUserCapAlert,
  clearMetronomePerUserWarningAlert,
  upsertMetronomePerUserCapAlert,
  upsertMetronomePerUserWarningAlert,
} from "@app/lib/metronome/alerts/spend_limits";
import { toFreeMetronomeUserId } from "@app/lib/metronome/constants";
import { getSeatAllowancesByNormalizedSeatType } from "@app/lib/metronome/seat_types";
import { getCachedSeatDataByUserId } from "@app/lib/metronome/seats";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { MembershipUpgradeRequestResource } from "@app/lib/resources/membership_upgrade_request_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import type {
  GetUserSpendLimitResponse,
  SetUserSpendLimitResponse,
  UserSpendLimit,
} from "@app/types/api/users/spend_limit";
import type { SpendLimitOverrideTimeframeType } from "@app/types/credits";
import type { MembershipSeatType } from "@app/types/memberships";
import { normalizeToPoolLimitSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export const MIN_USER_SPEND_LIMIT_AWU_CREDITS = 0;
export const MAX_USER_SPEND_LIMIT_AWU_CREDITS = 1_000_000;

export type UserSpendLimitErrorType =
  | "user_not_found"
  | "workspace_not_metronome_billed"
  | "metronome_error";

export class UserSpendLimitError extends Error {
  constructor(
    readonly type: UserSpendLimitErrorType,
    message: string
  ) {
    super(message);
  }
}

/**
 * Resolve the seat AWU allowance for a membership based on its seat type and
 * the active contract. Returns 0 when the contract or seat type can't be
 * resolved (e.g. free seats, no contract).
 */
async function resolveUserSeatAllowance(
  auth: Authenticator,
  membership: MembershipResource
): Promise<number> {
  const workspace = auth.getNonNullableWorkspace();
  const normalizedSeatType = normalizeToPoolLimitSeatType(membership.seatType);
  if (!normalizedSeatType) {
    logger.info(
      {
        workspaceId: workspace.sId,
        seatType: membership.seatType,
      },
      "[Metronome PerUserCap] seat type does not map to a pool-limit seat type; seat allowance is 0"
    );
    return 0;
  }
  const allowances = await getSeatAllowancesByNormalizedSeatType(workspace.sId);
  const seatAllowance = allowances[normalizedSeatType] ?? 0;
  logger.info(
    {
      workspaceId: workspace.sId,
      seatType: membership.seatType,
      normalizedSeatType,
      seatAllowance,
    },
    "[Metronome PerUserCap] resolved seat AWU allowance for membership"
  );
  return seatAllowance;
}

/**
 * Clear the Metronome per-user cap/warning alerts for a user reverted to the
 * unlimited (seat-default) spend limit. Shared by the admin-driven "use
 * workspace default" path and the automated expiration sweep.
 */
async function clearMetronomeSpendLimitAlerts({
  metronomeCustomerId,
  workspaceId,
  userId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  userId: string;
}): Promise<Result<void, UserSpendLimitError>> {
  const clearResult = await clearMetronomePerUserCapAlert({
    metronomeCustomerId,
    workspaceId,
    userId,
  });
  if (clearResult.isErr()) {
    logger.error(
      {
        workspaceId,
        metronomeCustomerId,
        userId,
        err: clearResult.error,
      },
      "[Metronome PerUserCap] set(unlimited): failed to clear per-user cap alert"
    );
    return new Err(
      new UserSpendLimitError("metronome_error", clearResult.error.message)
    );
  }
  const clearWarningResult = await clearMetronomePerUserWarningAlert({
    metronomeCustomerId,
    workspaceId,
    userId,
  });
  if (clearWarningResult.isErr()) {
    logger.warn(
      { workspaceId, userId, err: clearWarningResult.error },
      "[Metronome PerUserCap] Failed to clear warning alert; continuing"
    );
  }
  return new Ok(undefined);
}

export async function getUserSpendLimit(
  auth: Authenticator,
  { userId }: { userId: string }
): Promise<Result<GetUserSpendLimitResponse, UserSpendLimitError>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Err(
      new UserSpendLimitError(
        "workspace_not_metronome_billed",
        "Workspace is not on Metronome billing."
      )
    );
  }

  const user = await getUserForWorkspace(auth, { userId });
  if (!user) {
    return new Err(
      new UserSpendLimitError(
        "user_not_found",
        "Could not find the user in this workspace."
      )
    );
  }

  // The override persisted on the membership is the source of truth (the
  // Metronome alert is derived from it, with the seat allowance added).
  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });

  const nextCreditResetAt = await resolveNextCreditResetAt(auth, {
    userId: user.sId,
    seatType: membership?.seatType ?? null,
  });

  if (!membership || membership.poolCapOverrideAwuCredits === null) {
    return new Ok({ kind: "unlimited", nextCreditResetAt });
  }

  return new Ok({
    kind: "limited",
    awuCredits: membership.poolCapOverrideAwuCredits,
    timeframe: membership.overrideLimitTimeframe,
    expiresAt: membership.poolCapOverrideExpiresAt?.getTime() ?? null,
    nextCreditResetAt,
  });
}

/**
 * Resolve the next time this user's AWU credit pool resets (the Metronome
 * billing-period boundary), in epoch ms. Null when there is no active
 * Metronome contract to derive it from. Backed by
 * `getCachedSeatDataByUserId` (Redis-cached), the same primitive the members
 * usage table uses — a single cached workspace-wide fetch, not a per-user
 * Metronome round trip.
 */
async function resolveNextCreditResetAt(
  auth: Authenticator,
  { userId, seatType }: { userId: string; seatType: MembershipSeatType | null }
): Promise<number | null> {
  const workspace = auth.getNonNullableWorkspace();
  const metronomeContractId = auth.subscription()?.metronomeContractId ?? null;
  if (!workspace.metronomeCustomerId || !metronomeContractId) {
    return null;
  }

  // Best-effort: a Metronome outage should not break reads of the DB-backed
  // override/timeframe/expiresAt fields above, only degrade this hint to null.
  try {
    const seatDataByUserId = await getCachedSeatDataByUserId({
      metronomeCustomerId: workspace.metronomeCustomerId,
      contractId: metronomeContractId,
    });
    const metronomeUserId =
      seatType === "free" ? toFreeMetronomeUserId(userId) : userId;
    const nextCreditResetAt =
      seatDataByUserId[metronomeUserId]?.nextCreditResetAt;
    return nextCreditResetAt ? new Date(nextCreditResetAt).getTime() : null;
  } catch (err) {
    logger.warn(
      { workspaceId: workspace.sId, userId, err },
      "[Metronome PerUserCap] Failed to resolve next credit reset date"
    );
    return null;
  }
}

export async function setUserSpendLimit(
  auth: Authenticator,
  {
    userId,
    limit,
    auditContext,
    requestId,
  }: {
    userId: string;
    limit: UserSpendLimit;
    auditContext: AuditLogContext;
    // Set when this save resolves a specific upgrade request (the admin
    // opened "Edit limit" from that request in the requests table).
    // Snapshots the granted amount/expiry onto that request for history —
    // see `MembershipUpgradeRequestResource.recordGrant`.
    requestId?: string | null;
  }
): Promise<Result<SetUserSpendLimitResponse, UserSpendLimitError>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    logger.info(
      { workspaceId: workspace.sId, userId },
      "[Metronome PerUserCap] set: workspace is not on Metronome billing"
    );
    return new Err(
      new UserSpendLimitError(
        "workspace_not_metronome_billed",
        "Workspace is not on Metronome billing."
      )
    );
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      metronomeCustomerId: workspace.metronomeCustomerId,
      userId,
      kind: limit.kind,
      awuCredits: limit.kind === "limited" ? limit.awuCredits : null,
    },
    "[Metronome PerUserCap] set: starting per-user spend limit update"
  );

  const user = await getUserForWorkspace(auth, { userId });
  if (!user) {
    logger.info(
      { workspaceId: workspace.sId, userId },
      "[Metronome PerUserCap] set: user not found in workspace"
    );
    return new Err(
      new UserSpendLimitError(
        "user_not_found",
        "Could not find the user in this workspace."
      )
    );
  }

  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
  if (!workspaceResource) {
    return new Err(
      new UserSpendLimitError(
        "user_not_found",
        "Could not load workspace resource."
      )
    );
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });
  if (!membership) {
    return new Err(
      new UserSpendLimitError(
        "user_not_found",
        "Could not find an active membership for the user in this workspace."
      )
    );
  }

  // Any override change (whether or not this save is itself request-linked)
  // supersedes whatever grant was previously tracked as active for this
  // user — close it out before applying the new value.
  await MembershipUpgradeRequestResource.expireActiveGrantsForUser(auth, {
    user,
  });

  // Persist the admin's intent first: the membership is the source of truth,
  // the Metronome alerts below are derived enforcement (a failed sync can be
  // retried and re-derives from this value).
  await membership.updatePoolCapOverride({
    poolCapOverrideAwuCredits:
      limit.kind === "limited" ? limit.awuCredits : null,
    overrideLimitTimeframe: limit.kind === "limited" ? limit.timeframe : null,
    poolCapOverrideExpiresAt:
      limit.kind === "limited" && limit.expiresAt
        ? new Date(limit.expiresAt)
        : null,
  });

  if (requestId && limit.kind === "limited") {
    const request = await MembershipUpgradeRequestResource.fetchById(
      auth,
      requestId
    );
    if (request) {
      await request.recordGrant({
        awuCredits: limit.awuCredits,
        expiresAt: limit.expiresAt ? new Date(limit.expiresAt) : null,
      });
    } else {
      logger.warn(
        { workspaceId: workspace.sId, userId: user.sId, requestId },
        "[Metronome PerUserCap] Linked upgrade request not found; grant not recorded on it"
      );
    }
  }

  switch (limit.kind) {
    case "unlimited": {
      const clearResult = await clearMetronomeSpendLimitAlerts({
        metronomeCustomerId: workspace.metronomeCustomerId,
        workspaceId: workspace.sId,
        userId: user.sId,
      });
      if (clearResult.isErr()) {
        return new Err(clearResult.error);
      }
      break;
    }
    case "limited": {
      const seatAllowanceAwuCredits = await resolveUserSeatAllowance(
        auth,
        membership
      );
      const totalAwuCredits = limit.awuCredits + seatAllowanceAwuCredits;
      const upsertResult = await upsertMetronomePerUserCapAlert({
        metronomeCustomerId: workspace.metronomeCustomerId,
        workspaceId: workspace.sId,
        userId: user.sId,
        awuCredits: totalAwuCredits,
      });
      if (upsertResult.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            userId: user.sId,
            awuCredits: totalAwuCredits,
            seatAllowance: seatAllowanceAwuCredits,
            err: upsertResult.error,
          },
          "[Metronome PerUserCap] Failed to upsert per-user cap alert"
        );
        return new Err(
          new UserSpendLimitError("metronome_error", upsertResult.error.message)
        );
      }
      const upsertWarningResult = await upsertMetronomePerUserWarningAlert({
        metronomeCustomerId: workspace.metronomeCustomerId,
        workspaceId: workspace.sId,
        userId: user.sId,
        capAwuCredits: totalAwuCredits,
      });
      if (upsertWarningResult.isErr()) {
        logger.warn(
          {
            workspaceId: workspace.sId,
            userId: user.sId,
            awuCredits: totalAwuCredits,
            err: upsertWarningResult.error,
          },
          "[Metronome PerUserCap] Failed to upsert warning alert; continuing"
        );
      }
      break;
    }
    default:
      assertNever(limit);
  }

  // Reconcile the user's credit state from live usage — same path as the
  // poke reconcile button and the seat-sync reconcile.
  const metronomeContractId = auth.subscription()?.metronomeContractId ?? null;
  if (metronomeContractId) {
    void reconcileUser({
      auth,
      workspace: workspaceResource,
      metronomeCustomerId: workspace.metronomeCustomerId,
      userId: user.sId,
      execute: true,
    }).catch((err) => {
      logger.warn(
        { workspaceId: workspace.sId, userId: user.sId, err },
        "[Metronome PerUserCap] reconcileUser after spend-limit update failed; webhook will reconcile"
      );
    });
  }

  void emitAuditLogEvent({
    auth,
    action: "member.spend_limit_updated",
    targets: [
      buildAuditLogTarget("workspace", workspace),
      buildAuditLogTarget("user", {
        sId: user.sId,
        name: user.fullName() ?? "unknown",
      }),
    ],
    context: auditContext,
    metadata: {
      kind: limit.kind,
      awu_credits:
        limit.kind === "limited" ? String(limit.awuCredits) : "unlimited",
      timeframe:
        limit.kind === "limited" && limit.timeframe ? limit.timeframe : "",
      expires_at:
        limit.kind === "limited" && limit.expiresAt
          ? new Date(limit.expiresAt).toISOString()
          : "",
    },
  });

  return new Ok({ limit });
}

/**
 * Revert an expired pool cap override back to the seat-type default. Called
 * by the expiration sweep (`@app/temporal/spend_limit_expiration`) — never by
 * an admin action, hence the system-actored, dedicated audit event rather
 * than reusing `setUserSpendLimit`'s `member.spend_limit_updated`. A no-op
 * (idempotent `Ok`) if the override was already cleared or never expires,
 * e.g. an admin manually reverted it before the sweep ran.
 */
export async function expireUserSpendLimitOverride(
  auth: Authenticator,
  { userId }: { userId: string }
): Promise<
  Result<
    {
      reverted: boolean;
      previousAwuCredits: number | null;
      previousTimeframe: SpendLimitOverrideTimeframeType | null;
    },
    UserSpendLimitError
  >
> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Err(
      new UserSpendLimitError(
        "workspace_not_metronome_billed",
        "Workspace is not on Metronome billing."
      )
    );
  }

  // `getUserForWorkspace` requires `auth.user()`, which the system-actored
  // `Authenticator` the expiration sweep runs as does not have. Fetch
  // directly instead — the caller already scoped `userId` to this workspace.
  const user = await UserResource.fetchById(userId);
  if (!user) {
    return new Err(
      new UserSpendLimitError(
        "user_not_found",
        "Could not find the user in this workspace."
      )
    );
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });
  if (!membership || membership.poolCapOverrideAwuCredits === null) {
    return new Ok({
      reverted: false,
      previousAwuCredits: null,
      previousTimeframe: null,
    });
  }

  const previousAwuCredits = membership.poolCapOverrideAwuCredits;
  const previousTimeframe = membership.overrideLimitTimeframe;

  await MembershipUpgradeRequestResource.expireActiveGrantsForUser(auth, {
    user,
  });

  await membership.updatePoolCapOverride({
    poolCapOverrideAwuCredits: null,
    overrideLimitTimeframe: null,
    poolCapOverrideExpiresAt: null,
  });

  const clearResult = await clearMetronomeSpendLimitAlerts({
    metronomeCustomerId: workspace.metronomeCustomerId,
    workspaceId: workspace.sId,
    userId: user.sId,
  });
  if (clearResult.isErr()) {
    return new Err(clearResult.error);
  }

  const metronomeContractId = auth.subscription()?.metronomeContractId ?? null;
  if (metronomeContractId) {
    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (workspaceResource) {
      void reconcileUser({
        auth,
        workspace: workspaceResource,
        metronomeCustomerId: workspace.metronomeCustomerId,
        userId: user.sId,
        execute: true,
      }).catch((err) => {
        logger.warn(
          { workspaceId: workspace.sId, userId: user.sId, err },
          "[Metronome PerUserCap] reconcileUser after spend-limit expiration failed; webhook will reconcile"
        );
      });
    }
  }

  void emitAuditLogEventDirect({
    workspace,
    action: "membership.pool_cap_override_expired",
    actor: { type: "system", id: "spend-limit-expiration", name: "Dust" },
    targets: [
      buildAuditLogTarget("workspace", workspace),
      buildAuditLogTarget("user", {
        sId: user.sId,
        name: user.fullName() ?? "unknown",
      }),
    ],
    context: { location: "internal" },
    metadata: {
      previous_awu_credits: String(previousAwuCredits),
      previous_timeframe: previousTimeframe ?? "",
    },
  });

  return new Ok({ reverted: true, previousAwuCredits, previousTimeframe });
}
