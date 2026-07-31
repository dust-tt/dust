import {
  makeSpendLimitAwuCreditsRateLimitKeyForUser,
  makeSpendLimitCycleWindowBounds,
} from "@app/lib/api/assistant/rate_limits";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import {
  getEffectiveSpendCapAwuCreditsForUser,
  getEsConsumedAwuCreditsForUser,
} from "@app/lib/api/credits/members_usage";
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
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import { getSeatAllowancesByNormalizedSeatType } from "@app/lib/metronome/seat_types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  addFixedWindowCount,
  type FixedWindowBounds,
  getFixedWindowCount,
  setFixedWindowCount,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type {
  GetUserSpendLimitResponse,
  SetUserSpendLimitResponse,
  UserSpendLimit,
} from "@app/types/api/users/spend_limit";
import { normalizeToPoolLimitSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";

export const MIN_USER_SPEND_LIMIT_AWU_CREDITS = 0;
export const MAX_USER_SPEND_LIMIT_AWU_CREDITS = 2_000_000;

type UserSpendLimitErrorType =
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
  if (!membership || membership.poolCapOverrideAwuCredits === null) {
    return new Ok({ kind: "unlimited" });
  }

  return new Ok({
    kind: "limited",
    awuCredits: membership.poolCapOverrideAwuCredits,
  });
}

export async function setUserSpendLimit(
  auth: Authenticator,
  {
    userId,
    limit,
    auditContext,
  }: {
    userId: string;
    limit: UserSpendLimit;
    auditContext: AuditLogContext;
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

  // Persist the admin's intent first: the membership is the source of truth,
  // the Metronome alerts below are derived enforcement (a failed sync can be
  // retried and re-derives from this value).
  await membership.updatePoolCapOverride(
    limit.kind === "limited" ? limit.awuCredits : null
  );

  switch (limit.kind) {
    case "unlimited": {
      const clearResult = await clearMetronomePerUserCapAlert({
        metronomeCustomerId: workspace.metronomeCustomerId,
        workspaceId: workspace.sId,
        userId: user.sId,
      });
      if (clearResult.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            metronomeCustomerId: workspace.metronomeCustomerId,
            userId: user.sId,
            err: clearResult.error,
          },
          "[Metronome PerUserCap] set(unlimited): failed to clear per-user cap alert"
        );
        return new Err(
          new UserSpendLimitError("metronome_error", clearResult.error.message)
        );
      }
      const clearWarningResult = await clearMetronomePerUserWarningAlert({
        metronomeCustomerId: workspace.metronomeCustomerId,
        workspaceId: workspace.sId,
        userId: user.sId,
      });
      if (clearWarningResult.isErr()) {
        logger.warn(
          {
            workspaceId: workspace.sId,
            userId: user.sId,
            err: clearWarningResult.error,
          },
          "[Metronome PerUserCap] Failed to clear warning alert; continuing"
        );
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
    },
  });

  return new Ok({ limit });
}

// Fixed-window bounds for the current Metronome contract billing cycle (the
// window the per-user spend cap is bucketed on). `null` when no billing period
// can be resolved — callers treat that as a no-op (fail-open, matching the rest
// of the rate-limiter callers).
async function resolveSpendLimitCycleBounds(
  workspace: LightWorkspaceType
): Promise<FixedWindowBounds | null> {
  const periodResult = await getCachedMetronomeCurrentBillingPeriod(
    workspace.sId
  );
  if (periodResult.isErr() || !periodResult.value) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        err: periodResult.isErr() ? periodResult.error : undefined,
      },
      "[SpendLimitRateCap] Could not resolve contract billing period; skipping fixed-window cap"
    );
    return null;
  }
  const { cycleStart, cycleEnd } = periodResult.value;
  return makeSpendLimitCycleWindowBounds(cycleStart, cycleEnd);
}

/**
 * Reads the per-user spend-cap counter, lazily seeding it from Elasticsearch
 * whenever it reads as 0. A 0 count means the counter is absent — a brand-new
 * cycle (ES ≈ 0, a harmless no-op), the flag just enabled mid-cycle, or the key
 * evicted under Redis memory pressure — so nothing has been recorded that a
 * re-seed could clobber. ES is scoped to the current cycle, so the seeded value
 * is the correct cycle-to-date total in every case. A non-zero count is already
 * live (the first recorded delta bumps it above 0), so it's used as-is with no
 * ES read.
 *
 * Re-seeding on a 0 count is idempotent and cheap; `SET` (not `INCRBY`) makes
 * concurrent first-message seeds converge on the same value instead of doubling.
 * Recording (`recordUserSpendLimitUsage`) runs post-finalize, after this
 * send-time seed, so it accrues on top of the seeded value.
 *
 * Returns the effective count, or `null` on a Redis read error (caller fails
 * open). A seed write failure degrades to the ES value rather than throwing.
 */
async function readSpendLimitCountWithLazySeed(
  auth: Authenticator,
  {
    user,
    key,
    bounds,
  }: { user: UserResource; key: string; bounds: FixedWindowBounds }
): Promise<number | null> {
  const countResult = await getFixedWindowCount({ key, bounds });
  if (countResult.isErr()) {
    return null;
  }
  if (countResult.value > 0) {
    return countResult.value;
  }

  const consumed = Math.max(
    0,
    Math.round(await getEsConsumedAwuCreditsForUser(auth, { user }))
  );
  if (consumed > 0) {
    await setFixedWindowCount({ key, bounds, value: consumed, logger });
  }
  return consumed;
}

/**
 * Synchronous, Metronome-independent enforcement of the per-user spend cap, read
 * at message-send time from the Redis fixed-window counter over the current
 * contract billing cycle. The threshold is the user's *effective* cap resolved
 * the standard way (per-user override > group cap > seat-type/workspace
 * default, each incl. the seat allowance) — the same resolution the usage table
 * uses. Runs alongside the Metronome per-user cap (`isUserBlocked`) as a faster,
 * independent backup. Returns `false` (does not block) when there is no cap, the
 * billing period can't be resolved, or on a Redis read error (fail-open).
 */
export async function isUserSpendLimitRateCapReached(
  auth: Authenticator,
  { user }: { user: UserResource }
): Promise<boolean> {
  const workspace = auth.getNonNullableWorkspace();

  const threshold = await getEffectiveSpendCapAwuCreditsForUser(auth, { user });
  if (threshold === null) {
    return false;
  }

  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return false;
  }

  const count = await readSpendLimitCountWithLazySeed(auth, {
    user,
    key: makeSpendLimitAwuCreditsRateLimitKeyForUser(workspace, user.toJSON()),
    bounds,
  });
  if (count === null) {
    logger.error(
      { workspaceId: workspace.sId, userId: user.sId },
      "[SpendLimitRateCap] Failed to read fixed-window count; allowing message"
    );
    return false;
  }

  return count >= threshold;
}

/**
 * Adds `incrementBy` AWU credits to the per-user fixed-window spend-cap counter
 * for the current contract billing cycle. Records for every user (all users are
 * capped; the cap is resolved at enforcement/read time, not here). `incrementBy`
 * is the newly-accrued delta for a message (not its running total — the caller
 * diffs against the previously-recorded amount so repeated finalizes don't
 * over-count). No-op when the billing period can't be resolved.
 */
export async function recordUserSpendLimitUsage(
  auth: Authenticator,
  { user, incrementBy }: { user: UserResource; incrementBy: number }
): Promise<void> {
  // Only whole positive credits are recordable (the counter is an integer
  // INCRBY); skip anything else rather than letting it reach the counter.
  if (!Number.isInteger(incrementBy) || incrementBy <= 0) {
    return;
  }

  const workspace = auth.getNonNullableWorkspace();

  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return;
  }

  await addFixedWindowCount({
    key: makeSpendLimitAwuCreditsRateLimitKeyForUser(workspace, user.toJSON()),
    bounds,
    incrementBy,
    logger,
  });
}
