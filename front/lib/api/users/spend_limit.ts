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
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import {
  clearMetronomePerUserCapAlert,
  clearMetronomePerUserWarningAlert,
  USER_AWU_WARNING_PERCENTAGE,
  upsertMetronomePerUserCapAlert,
  upsertMetronomePerUserWarningAlert,
} from "@app/lib/metronome/alerts/spend_limits";
import { getSeatAllowancesByNormalizedSeatType } from "@app/lib/metronome/seat_types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  currentCalendarMonthCycleUtc,
  resolveSpendLimitCycleBounds,
} from "@app/lib/spend_limits/cycle";
import { revertOnSyncFailure } from "@app/lib/spend_limits/revert_on_sync_failure";
import type { FixedWindowBounds } from "@app/lib/utils/rate_limiter";
import {
  addFixedWindowCount,
  readFixedWindowCountWithLazySeed,
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
  const previousPoolCapOverride = membership.poolCapOverrideSnapshot;
  const previousAwuCredits = previousPoolCapOverride.poolCapOverrideAwuCredits;

  await membership.updatePoolCapOverride({
    poolCapOverrideAwuCredits:
      limit.kind === "limited" ? limit.awuCredits : null,
  });

  const revert = () =>
    membership.revertPoolCapOverride(previousPoolCapOverride);

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
 * The seed is applied with `seedFixedWindowCountIfAbsent` (atomic SET-if-absent,
 * not a plain SET): if a concurrent `recordUserSpendLimitUsage` INCRBY lands
 * while the ES value is being computed, the seed leaves that live value untouched
 * rather than clobbering it, and returns the effective count. Recording runs
 * post-finalize, after this send-time seed, so it accrues on top of the seeded
 * value.
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
  return readFixedWindowCountWithLazySeed({
    key,
    bounds,
    logger,
    // The counter stores microCredits; convert the ES credit value before
    // seeding. Preserve the null contract (ES read failed → skip seed, do not
    // seed as 0).
    fetchSeedValue: async () => {
      const consumedAwuCredits = await getEsConsumedAwuCreditsForUser(auth, {
        user,
        cycle,
      });
      return consumedAwuCredits === null
        ? null
        : roundCreditsToMicroCredits(consumedAwuCredits);
    },
  });
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

  // The counter stores microCredits; scale the credit threshold up so the
  // comparison stays integer-on-integer.
  return count >= roundCreditsToMicroCredits(thresholdAwuCredits);
}

/**
 * Synchronous, Metronome-independent enforcement of the per-user spend cap, read
 * at message-send time from the Redis fixed-window counter over the current
 * contract billing cycle. The threshold is the user's *effective* cap resolved
 * the standard way (per-user override > group cap > seat-type/workspace
 * default, each incl. the seat allowance) — the same resolution the usage table
 * uses. Runs alongside the Metronome per-user cap (`isUserBlocked`) as a faster,
 * independent backup.
 *
 * Returns `null` when the user has no cycle spend cap at all (e.g. free/none
 * seats, whose lifetime credit balance is not modeled by this cycle counter) —
 * the caller must fall back to the Metronome credit state for those. Returns
 * `false` (does not block) when the billing period can't be resolved or on a
 * Redis read error (fail-open).
 */
export async function isUserSpendLimitRateCapReached(
  auth: Authenticator,
  { user }: { user: UserResource }
): Promise<boolean | null> {
  const workspace = auth.getNonNullableWorkspace();

  const threshold = await getEffectiveSpendCapAwuCreditsForUser(auth, { user });
  if (threshold === null) {
    return null;
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
 * Synchronous, Metronome-independent "near limit" (warning) signal for the
 * per-user spend cap. Same Redis fixed-window counter and effective-cap
 * resolution as `isUserSpendLimitRateCapReached`, but compares against
 * `USER_AWU_WARNING_PERCENTAGE` (80%) of the cap instead of the full cap. This
 * is the rate-limiter counterpart of the Metronome-driven `isUserAwuWarned`
 * flag.
 *
 * Returns `null` when the user has no cycle spend cap at all (e.g. free/none
 * seats — the caller must fall back to the Metronome near-limit flag). Returns
 * `false` when the billing period can't be resolved or on a Redis read error
 * (fail-open).
 */
export async function isUserSpendLimitRateWarningReached(
  auth: Authenticator,
  { user }: { user: UserResource }
): Promise<boolean | null> {
  const workspace = auth.getNonNullableWorkspace();

  const threshold = await getEffectiveSpendCapAwuCreditsForUser(auth, { user });
  if (threshold === null) {
    return null;
  }

  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return false;
  }

  return isSpendCapCounterReached(auth, {
    user,
    thresholdAwuCredits: threshold * USER_AWU_WARNING_PERCENTAGE,
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
  // Credits may be fractional; the counter stores microCredits (integer
  // INCRBY), so convert before recording. A non-positive or non-finite delta is
  // a normal no-op (e.g. a retry with no new usage) and stays silent.
  if (!Number.isFinite(incrementBy) || incrementBy <= 0) {
    return;
  }

  const workspace = auth.getNonNullableWorkspace();

  const bounds = cycle
    ? makeSpendLimitCycleWindowBounds(cycle.cycleStart, cycle.cycleEnd)
    : await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return;
  }

  const key = makeSpendLimitAwuCreditsRateLimitKeyForUser(
    workspace,
    user.toJSON()
  );

  // Seed the counter from ES on its first touch of the cycle (SET-if-absent),
  // so it reflects cycle-to-date consumption even when the enforcement reader —
  // the other lazy seeder — never runs for this user (e.g. a user with no
  // effective cap). No-ops once the counter is live.
  await readSpendLimitCountWithLazySeed(auth, { user, key, bounds, cycle });

  const incrementByMicroCredits = roundCreditsToMicroCredits(incrementBy);

  await addFixedWindowCount({
    key,
    bounds,
    incrementBy: incrementByMicroCredits,
    logger,
  });
}
