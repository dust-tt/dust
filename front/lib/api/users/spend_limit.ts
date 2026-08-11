import {
  makeSpendLimitAwuCreditsRateLimitKeyForUser,
  makeSpendLimitCycleWindowBounds,
} from "@app/lib/api/assistant/rate_limits";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import {
  getEffectiveSpendCapAwuCreditsForUser,
  getEsConsumedAwuCreditsForUser,
} from "@app/lib/api/credits/members_usage";
import { reconcileUser } from "@app/lib/api/metronome/reconcile_credit_state";
import { getUserForWorkspace } from "@app/lib/api/user";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import { getNonCreditPricedDefaultUserSpendLimit } from "@app/lib/api/workspace/default_user_spend_limit";
import type { Authenticator } from "@app/lib/auth";
import type { BillingCycle } from "@app/lib/client/subscription";
import {
  clearMetronomePerUserCapAlert,
  clearMetronomePerUserWarningAlert,
  upsertMetronomePerUserCapAlert,
  upsertMetronomePerUserWarningAlert,
} from "@app/lib/metronome/alerts/spend_limits";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import { getSeatAllowancesByNormalizedSeatType } from "@app/lib/metronome/seat_types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { MembershipUpgradeRequestResource } from "@app/lib/resources/membership_upgrade_request_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { currentCalendarMonthCycleUtc } from "@app/lib/spend_limits/cycle";
import { revertOnSyncFailure } from "@app/lib/spend_limits/revert_on_sync_failure";
import type { FixedWindowBounds } from "@app/lib/utils/rate_limiter";
import {
  addFixedWindowCount,
  getFixedWindowCount,
  setFixedWindowCount,
} from "@app/lib/utils/rate_limiter";
import { withTransaction } from "@app/lib/utils/sql_utils";
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
  | "metronome_error"
  | "request_invalid";

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

  const nextCreditResetAt = await resolveNextCreditResetAt(workspace);

  if (!membership || membership.poolCapOverrideAwuCredits === null) {
    return new Ok({ kind: "unlimited", nextCreditResetAt });
  }

  return new Ok({
    kind: "limited",
    awuCredits: membership.poolCapOverrideAwuCredits,
    expiresAt: membership.poolCapOverrideExpiresAt?.getTime() ?? null,
    nextCreditResetAt,
  });
}

/**
 * Resolve the workspace's next AWU credit pool reset (the Metronome contract
 * billing-period boundary), in epoch ms.  Null when there is no active
 * Metronome contract to derive it from, or on a Metronome outage.
 */
async function resolveNextCreditResetAt(
  workspace: LightWorkspaceType
): Promise<number | null> {
  if (!workspace.metronomeCustomerId) {
    return null;
  }
  const periodResult = await getCachedMetronomeCurrentBillingPeriod(
    workspace.sId
  );
  if (periodResult.isErr() || !periodResult.value) {
    return null;
  }
  return periodResult.value.cycleEnd.getTime();
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
    // Set when this save resolves a specific upgrade request.
    // Snapshots the granted amount/expiry
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

  // Captured before the transaction below (and the Metronome sync further
  // down) so a failed sync can revert the membership back to exactly this
  // state: the membership is the source of truth, the Metronome alerts are
  // derived enforcement.
  const previousPoolCapOverride = membership.poolCapOverrideSnapshot;
  const previousAwuCredits = previousPoolCapOverride.poolCapOverrideAwuCredits;

  // The membership override and its linked-request grant snapshot must land
  // together for consistency. The request must belong to `userId` and must
  // not have been resolved to a conflicting outcome. `resolveUpgradeRequest`
  // claims the request via its own compare-and-set on `status = 'pending'`
  // before calling this, so by the time this runs the status is expected to
  // already be "approved" (not "pending") — `pending` is only accepted for
  // callers that apply the limit without going through that claim step.
  let request: MembershipUpgradeRequestResource | null = null;
  if (requestId) {
    request = await MembershipUpgradeRequestResource.fetchById(auth, requestId);
    if (
      !request ||
      request.requester.sId !== user.sId ||
      request.status === "denied"
    ) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          userId: user.sId,
          requestId,
          requestFound: !!request,
          requestStatus: request?.status,
        },
        "[Metronome PerUserCap] set: linked upgrade request not found, mismatched, or denied"
      );
      return new Err(
        new UserSpendLimitError(
          "request_invalid",
          "The linked upgrade request could not be found, does not belong to this user, or was denied."
        )
      );
    }
  }
  const previousGrantSnapshot = request?.grantSnapshot ?? null;

  await withTransaction(async (transaction) => {
    // Persist the admin's intent first: the membership is the source of
    // truth, the Metronome alerts below are derived enforcement (a failed
    // sync can be retried and re-derives from this value).
    await membership.updatePoolCapOverride(
      {
        poolCapOverrideAwuCredits:
          limit.kind === "limited" ? limit.awuCredits : null,
        poolCapOverrideExpiresAt:
          limit.kind === "limited" && limit.expiresAt
            ? new Date(limit.expiresAt)
            : null,
      },
      transaction
    );

    if (request) {
      await request.recordGrant(
        limit.kind === "limited"
          ? {
              kind: "limited",
              awuCredits: limit.awuCredits,
              expiryKind: limit.expiryKind ?? null,
            }
          : { kind: limit.kind },
        { transaction }
      );
    }
  });

  // On a Metronome failure below, both the membership override and the
  // linked request's grant snapshot are put back: the DB write is only
  // valid once the derived Metronome sync has actually succeeded.
  const revert = async () => {
    await membership.revertPoolCapOverride(previousPoolCapOverride);
    if (request && previousGrantSnapshot) {
      await request.revertGrant(previousGrantSnapshot);
    }
  };

  switch (limit.kind) {
    case "unlimited": {
      const clearResult = await revertOnSyncFailure(
        await clearMetronomePerUserCapAlert({
          metronomeCustomerId: workspace.metronomeCustomerId,
          workspaceId: workspace.sId,
          userId: user.sId,
        }),
        {
          revert,
          logContext: {
            scope: "user",
            operation: "clear_cap_alert",
            workspaceId: workspace.sId,
            metronomeCustomerId: workspace.metronomeCustomerId,
            userId: user.sId,
            previousAwuCredits,
          },
        }
      );
      if (clearResult.isErr()) {
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
      const upsertResult = await revertOnSyncFailure(
        await upsertMetronomePerUserCapAlert({
          metronomeCustomerId: workspace.metronomeCustomerId,
          workspaceId: workspace.sId,
          userId: user.sId,
          awuCredits: totalAwuCredits,
        }),
        {
          revert,
          logContext: {
            scope: "user",
            operation: "upsert_cap_alert",
            workspaceId: workspace.sId,
            userId: user.sId,
            awuCredits: totalAwuCredits,
            seatAllowance: seatAllowanceAwuCredits,
            previousAwuCredits,
          },
        }
      );
      if (upsertResult.isErr()) {
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
      expires_at:
        limit.kind === "limited" && limit.expiresAt
          ? new Date(limit.expiresAt).toISOString()
          : "",
    },
  });

  return new Ok({ limit });
}

/**
 * Revert an expired pool cap override back to the seat-type default. A no-op
 * if the override was already cleared or never expires.
 */
export async function expireUserSpendLimitOverride(
  auth: Authenticator,
  {
    user,
    membership,
    workspace,
  }: {
    user: UserResource;
    membership: MembershipResource;
    workspace: WorkspaceResource;
  }
): Promise<
  Result<
    { reverted: boolean; previousAwuCredits: number | null },
    UserSpendLimitError
  >
> {
  if (!workspace.metronomeCustomerId) {
    return new Err(
      new UserSpendLimitError(
        "workspace_not_metronome_billed",
        "Workspace is not on Metronome billing."
      )
    );
  }

  if (membership.poolCapOverrideAwuCredits === null) {
    return new Ok({ reverted: false, previousAwuCredits: null });
  }

  const previousPoolCapOverride = membership.poolCapOverrideSnapshot;
  const previousAwuCredits = previousPoolCapOverride.poolCapOverrideAwuCredits;

  await membership.updatePoolCapOverride({
    poolCapOverrideAwuCredits: null,
    poolCapOverrideExpiresAt: null,
  });

  // On any Metronome failure below, the DB override is put back rather than
  // left cleared: keeps DB and Metronome consistent
  const revert = () =>
    membership.revertPoolCapOverride(previousPoolCapOverride);

  const clearResult = await revertOnSyncFailure(
    await clearMetronomePerUserCapAlert({
      metronomeCustomerId: workspace.metronomeCustomerId,
      workspaceId: workspace.sId,
      userId: user.sId,
    }),
    {
      revert,
      logContext: {
        scope: "user",
        operation: "expire_clear_cap_alert",
        workspaceId: workspace.sId,
        userId: user.sId,
        previousAwuCredits,
      },
    }
  );
  if (clearResult.isErr()) {
    return new Err(
      new UserSpendLimitError("metronome_error", clearResult.error.message)
    );
  }
  const clearWarningResult = await revertOnSyncFailure(
    await clearMetronomePerUserWarningAlert({
      metronomeCustomerId: workspace.metronomeCustomerId,
      workspaceId: workspace.sId,
      userId: user.sId,
    }),
    {
      revert,
      logContext: {
        scope: "user",
        operation: "expire_clear_warning_alert",
        workspaceId: workspace.sId,
        userId: user.sId,
        previousAwuCredits,
      },
    }
  );
  if (clearWarningResult.isErr()) {
    return new Err(
      new UserSpendLimitError(
        "metronome_error",
        clearWarningResult.error.message
      )
    );
  }

  const metronomeContractId = auth.subscription()?.metronomeContractId ?? null;
  if (metronomeContractId) {
    await reconcileUser({
      auth,
      workspace,
      metronomeCustomerId: workspace.metronomeCustomerId,
      userId: user.sId,
      execute: true,
    });
  }

  void emitAuditLogEventDirect({
    workspace: auth.getNonNullableWorkspace(),
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
      new_awu_credits: "unlimited",
    },
  });

  return new Ok({ reverted: true, previousAwuCredits });
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
    cycle,
  }: {
    user: UserResource;
    key: string;
    bounds: FixedWindowBounds;
    // Forces the window the ES seed sums over, so it matches `bounds`.
    cycle?: BillingCycle;
  }
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
    Math.round(await getEsConsumedAwuCreditsForUser(auth, { user, cycle }))
  );
  if (consumed > 0) {
    await setFixedWindowCount({ key, bounds, value: consumed, logger });
  }
  return consumed;
}

/**
 * Compares the per-user fixed-window counter against `thresholdAwuCredits` over
 * `bounds`. Shared by the credit-priced and non-credit-priced entry points below,
 * which differ only in how the threshold and the cycle are resolved. Fails open
 * (returns `false`) on a Redis read error.
 */
async function isSpendCapCounterReached(
  auth: Authenticator,
  {
    user,
    thresholdAwuCredits,
    bounds,
    cycle,
  }: {
    user: UserResource;
    thresholdAwuCredits: number;
    bounds: FixedWindowBounds;
    cycle?: BillingCycle;
  }
): Promise<boolean> {
  const workspace = auth.getNonNullableWorkspace();

  const count = await readSpendLimitCountWithLazySeed(auth, {
    user,
    key: makeSpendLimitAwuCreditsRateLimitKeyForUser(workspace, user.toJSON()),
    bounds,
    cycle,
  });
  if (count === null) {
    logger.error(
      { workspaceId: workspace.sId, userId: user.sId },
      "[SpendLimitRateCap] Failed to read fixed-window count; allowing message"
    );
    return false;
  }

  return count >= thresholdAwuCredits;
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

  return isSpendCapCounterReached(auth, {
    user,
    thresholdAwuCredits: threshold,
    bounds,
  });
}

/**
 * Per-user spend cap for workspaces that are *not* on a credit-priced plan. Same
 * Redis fixed-window counter as `isUserSpendLimitRateCapReached`, with the two
 * Metronome-dependent inputs replaced:
 *   - the threshold is the optional workspace-wide default.
 *   - the cycle is the UTC calendar month, since there is no contract billing
 *     period to anchor on.
 *
 * Returns `false` when no limit is configured, or on a Redis read error (fail-open).
 */
export async function isNonCreditPricedUserSpendLimitReached(
  auth: Authenticator,
  { user }: { user: UserResource }
): Promise<boolean> {
  const threshold = await getNonCreditPricedDefaultUserSpendLimit(auth);
  if (threshold === 0) {
    return false;
  }

  const cycle = currentCalendarMonthCycleUtc();

  return isSpendCapCounterReached(auth, {
    user,
    thresholdAwuCredits: threshold,
    bounds: makeSpendLimitCycleWindowBounds(cycle.cycleStart, cycle.cycleEnd),
    cycle,
  });
}

/**
 * Adds `incrementBy` AWU credits to the per-user fixed-window spend-cap counter
 * for the current contract billing cycle. Records for every user (all users are
 * capped; the cap is resolved at enforcement/read time, not here). `incrementBy`
 * is the newly-accrued delta for a message (not its running total — the caller
 * diffs against the previously-recorded amount so repeated finalizes don't
 * over-count). No-op when the billing period can't be resolved.
 *
 * Bucketed on the cycle the workspace is enforced on: the contract billing period
 * by default, or `cycle` when the caller forces one (the UTC calendar month for
 * workspaces with no contract — see `spendLimitCycleOverrideForAuth`). Reader and
 * writer must agree here, or the counter accrues under a key nothing reads.
 */
export async function recordUserSpendLimitUsage(
  auth: Authenticator,
  {
    user,
    incrementBy,
    cycle,
  }: { user: UserResource; incrementBy: number; cycle?: BillingCycle }
): Promise<void> {
  // Only whole positive credits are recordable (the counter is an integer
  // INCRBY); skip anything else rather than letting it reach the counter.
  if (!Number.isInteger(incrementBy) || incrementBy <= 0) {
    return;
  }

  const workspace = auth.getNonNullableWorkspace();

  const bounds = cycle
    ? makeSpendLimitCycleWindowBounds(cycle.cycleStart, cycle.cycleEnd)
    : await resolveSpendLimitCycleBounds(workspace);
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
