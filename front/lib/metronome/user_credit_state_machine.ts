import {
  clearUserAwuWarned,
  clearUserCapBlocked,
  setUserAwuWarned,
  setUserCapBlocked,
  setUserCreditState,
} from "@app/lib/metronome/user_block";
import type { MembershipResource } from "@app/lib/resources/membership_resource";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type {
  MembershipSeatType,
  UserCreditState,
} from "@app/types/memberships";
import { expectedUserCreditState } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Transaction } from "sequelize";
import {
  MAX_SEAT_MONTHLY_AWU_CREDITS,
  PRO_SEAT_MONTHLY_AWU_CREDITS,
} from "./setup_new_pricing";

/**
 * Live per-user balance snapshot used to resolve the seat↔pool band when a
 * per-user cap resolves. Fields mirror the inputs of `expectedUserCreditState`.
 * `null` fields mean "unknown" (e.g. pool-based seat with no individual
 * allocation, or no configured cap), handled the same way as in reconciliation.
 */
export type LiveUserSeatBalance = {
  seatBalanceAwu: number | null;
  seatStartingBalanceAwu: number | null;
  perUserCapAwuCredits: number | null;
  consumedAwuCredits: number | null;
};

export type UserCreditContext = {
  workspaceId: string;
  userId: string;
  /** Seat type of the membership — required by guards on seat-balance transitions. */
  seatType?: MembershipSeatType | null;
  /**
   * Live balance snapshot. When present, the `per_user_cap_resolved` transition
   * recomputes the correct seat↔pool band from it (user_seat /
   * user_seat_low_balance / on_pool / on_pool_low_balance) instead of defaulting
   * to `on_pool`. Absent for events that don't carry balance data.
   */
  liveBalance?: LiveUserSeatBalance;
  /**
   * Fraction of the user's per-user cap credits still remaining (0–1).
   * Required by guards on `seat_balance_exhausted` for paid seats to decide
   * whether to land on `on_pool`, `on_pool_low_balance`, or `capped`.
   */
  remainingCapCreditsPercentage?: number | null;
};

export type UserCreditEvent =
  /** This user hit their admin-configured per-user spend cap. */
  | { type: "per_user_cap_reached" }
  /**
   * This user's spend dropped back below the cap. Triggered by
   * `alerts.spend_threshold_resolved` per-user: fires at billing-cycle
   * renewal (current_spend resets to 0)
   */
  | { type: "per_user_cap_resolved" }
  /** Admin raised this user's per-user cap
   * TODO(remy): fire this transition when a user alert is removed and a
   * new one is created.
   */
  | { type: "admin_raised_user_cap" }
  /**
   * This user's personal seat balance is exhausted. The user's effective pool
   * limit determines the next state:
   *   - free seats → always `capped` (no pool access)
   *   - paid seats with `poolLimitAwuCredits === 0` → `capped`
   *   - paid seats with `poolLimitAwuCredits > 0` or `null` (unlimited) → `on_pool`
   */
  | { type: "seat_balance_exhausted"; poolLimitAwuCredits: number | null }
  /**
   * This user's personal seat balance crossed a low-balance warning threshold
   * (balance > 0). Moves `user_seat` → `user_seat_low_balance`.
   */
  | { type: "seat_low_balance"; threshold: number }
  /**
   * Billing-period renewal: Metronome replenished this user's seat balance.
   * Only applies to pro/max seats (workspace seats have no individual seat
   * balance; free seats stay `capped`). Resets any state back to `user_seat`.
   */
  | { type: "seat_balance_resolved" }
  /**
   * User hit the 80% warning threshold of their admin-configured per-user
   * spend cap. Moves `on_pool` → `on_pool_low_balance` to surface the
   * low-balance warning without blocking the user.
   */
  | { type: "per_user_cap_warning" };

type UserCreditGuard = (
  ctx: UserCreditContext,
  event: UserCreditEvent
) => boolean;

type UserCreditTransition = {
  from: UserCreditState | UserCreditState[];
  event: UserCreditEvent["type"];
  guard?: UserCreditGuard;
  to: UserCreditState;
};

// Seat↔pool band a user should land in when their per-user cap resolves,
// derived from the live balance snapshot carried in the context. Used by the
// guards on the `per_user_cap_resolved` transitions below (mirroring how the
// `seat_balance_exhausted` guards branch on seat type / pool limit). Without a
// snapshot we can't distinguish seat from pool, so default to the pool.
function targetAfterCapResolved(ctx: UserCreditContext): UserCreditState {
  if (!ctx.liveBalance) {
    return "on_pool";
  }
  return expectedUserCreditState({
    seatType: ctx.seatType ?? null,
    ...ctx.liveBalance,
  });
}

function syncUserCapCacheForState(
  state: UserCreditState,
  ctx: UserCreditContext,
  transaction: Transaction | undefined
): void {
  switch (state) {
    // Spending normally (personal credits or workspace pool): not capped, no
    // low-balance warning. "normal" is the legacy alias of "on_pool" kept
    // during the migration window (see USER_CREDIT_STATES).
    case "normal":
    case "user_seat":
    case "on_pool":
      invalidateCacheAfterCommit(transaction, () =>
        clearUserCapBlocked(ctx.workspaceId, ctx.userId)
      );
      invalidateCacheAfterCommit(transaction, () =>
        clearUserAwuWarned(ctx.workspaceId, ctx.userId)
      );
      invalidateCacheAfterCommit(transaction, () =>
        setUserCreditState(ctx.workspaceId, ctx.userId, state)
      );
      return;

    // Still spending, but ≥80% of the personal balance / per-user cap used:
    // not capped, but the low-balance warning is active.
    case "user_seat_low_balance":
    case "on_pool_low_balance":
      invalidateCacheAfterCommit(transaction, () =>
        clearUserCapBlocked(ctx.workspaceId, ctx.userId)
      );
      invalidateCacheAfterCommit(transaction, () =>
        setUserAwuWarned(ctx.workspaceId, ctx.userId)
      );
      invalidateCacheAfterCommit(transaction, () =>
        setUserCreditState(ctx.workspaceId, ctx.userId, state)
      );
      return;

    case "capped":
      invalidateCacheAfterCommit(transaction, () =>
        setUserCapBlocked(ctx.workspaceId, ctx.userId)
      );
      invalidateCacheAfterCommit(transaction, () =>
        setUserCreditState(ctx.workspaceId, ctx.userId, state)
      );
      return;

    default:
      assertNever(state);
  }
}

const TRANSITIONS: UserCreditTransition[] = [
  {
    from: [
      "user_seat",
      "user_seat_low_balance",
      "on_pool",
      "on_pool_low_balance",
      "capped",
    ],
    event: "per_user_cap_reached",
    to: "capped",
  },
  {
    from: ["on_pool", "on_pool_low_balance", "capped"],
    event: "admin_raised_user_cap",
    to: "on_pool",
  },
  // per_user_cap_resolved: the cap dimension cleared, so re-derive the seat↔pool
  // band from the live balance snapshot and route to it via guards (same shape
  // as the seat_balance_exhausted transitions below). A seat-based user who
  // still has personal balance lands back in `user_seat` /
  // `user_seat_low_balance`; otherwise they spend from the pool. The unguarded
  // entry last is the default — also the no-snapshot case (reconcile / billing
  // webhooks correct it later).
  {
    from: [
      "user_seat",
      "user_seat_low_balance",
      "on_pool",
      "on_pool_low_balance",
      "capped",
    ],
    event: "per_user_cap_resolved",
    guard: (ctx) => targetAfterCapResolved(ctx) === "user_seat",
    to: "user_seat",
  },
  {
    from: [
      "user_seat",
      "user_seat_low_balance",
      "on_pool",
      "on_pool_low_balance",
      "capped",
    ],
    event: "per_user_cap_resolved",
    guard: (ctx) => targetAfterCapResolved(ctx) === "user_seat_low_balance",
    to: "user_seat_low_balance",
  },
  {
    from: [
      "user_seat",
      "user_seat_low_balance",
      "on_pool",
      "on_pool_low_balance",
      "capped",
    ],
    event: "per_user_cap_resolved",
    guard: (ctx) => targetAfterCapResolved(ctx) === "on_pool_low_balance",
    to: "on_pool_low_balance",
  },
  {
    from: [
      "user_seat",
      "user_seat_low_balance",
      "on_pool",
      "on_pool_low_balance",
      "capped",
    ],
    event: "per_user_cap_resolved",
    to: "on_pool",
  },
  // Seat balance exhausted. Order matters: most specific guard first.
  //  1. Free seats → always capped (no pool access).
  {
    from: ["user_seat", "user_seat_low_balance", "capped"],
    event: "seat_balance_exhausted",
    guard: (ctx) => ctx.seatType === "free",
    to: "capped",
  },
  // 2. Paid seats whose per-user cap is also exhausted (0 % remaining) or with pool limit = 0 → capped (no pool budget).
  {
    from: ["user_seat", "user_seat_low_balance", "capped"],
    event: "seat_balance_exhausted",
    guard: (ctx, event) =>
      ctx.seatType !== "free" &&
      event.type === "seat_balance_exhausted" &&
      (event.poolLimitAwuCredits === 0 ||
        ctx.remainingCapCreditsPercentage === 0),
    to: "capped",
  },
  // 3. Paid seats with < 20 % of cap remaining → on_pool_low_balance.
  {
    from: ["user_seat", "user_seat_low_balance"],
    event: "seat_balance_exhausted",
    guard: (ctx) =>
      ctx.seatType !== "free" &&
      ctx.remainingCapCreditsPercentage != null &&
      ctx.remainingCapCreditsPercentage < 0.2,
    to: "on_pool_low_balance",
  },
  // 4. Paid seats with ≥ 20 % of cap remaining, with pool limit > 0 or null (unlimited) → on_pool
  {
    from: ["user_seat", "user_seat_low_balance", "on_pool"],
    event: "seat_balance_exhausted",
    guard: (ctx, event) =>
      ctx.seatType !== "free" &&
      event.type === "seat_balance_exhausted" &&
      event.poolLimitAwuCredits !== 0,
    to: "on_pool",
  },

  // Seat low-balance warning (balance > 0). Guards match threshold to seat
  // type so only the intended seats transition.
  {
    from: ["user_seat", "user_seat_low_balance"],
    event: "seat_low_balance",
    guard: (ctx, event) =>
      event.type === "seat_low_balance" &&
      event.threshold === 0.2 * MAX_SEAT_MONTHLY_AWU_CREDITS &&
      (ctx.seatType === "max" || ctx.seatType === "max_yearly"),
    to: "user_seat_low_balance",
  },
  {
    from: ["user_seat", "user_seat_low_balance"],
    event: "seat_low_balance",
    guard: (ctx, event) =>
      event.type === "seat_low_balance" &&
      event.threshold === 0.2 * PRO_SEAT_MONTHLY_AWU_CREDITS &&
      (ctx.seatType === "pro" || ctx.seatType === "pro_yearly"),
    to: "user_seat_low_balance",
  },

  // Per-user cap 80% warning: move on_pool → on_pool_low_balance.
  {
    from: ["on_pool", "on_pool_low_balance"],
    event: "per_user_cap_warning",
    to: "on_pool_low_balance",
  },

  // Billing-period renewal for pro/max seats: reset to user_seat regardless
  // of current state. Workspace seats are reset by per_user_cap_resolved;
  // free seats are not reset.
  {
    from: [
      "user_seat",
      "user_seat_low_balance",
      "on_pool",
      "on_pool_low_balance",
    ],
    event: "seat_balance_resolved",
    guard: (ctx) =>
      ctx.seatType === "pro" ||
      ctx.seatType === "pro_yearly" ||
      ctx.seatType === "max" ||
      ctx.seatType === "max_yearly",
    to: "user_seat",
  },
];

function findTransition(
  current: UserCreditState,
  event: UserCreditEvent,
  ctx: UserCreditContext
): UserCreditTransition | undefined {
  return TRANSITIONS.find((t) => {
    const fromMatch = Array.isArray(t.from)
      ? t.from.includes(current)
      : t.from === current;
    return (
      fromMatch && t.event === event.type && (!t.guard || t.guard(ctx, event))
    );
  });
}

export async function transitionUserCreditState(
  membership: MembershipResource,
  event: UserCreditEvent,
  ctx: UserCreditContext,
  { transaction }: { transaction?: Transaction } = {}
): Promise<Result<UserCreditState, Error>> {
  const rawState = membership.creditState;
  // "normal" is the legacy alias of "on_pool" (migration window): match
  // transitions as if the row were already "on_pool". A matching transition
  // then persists the canonical value, opportunistically migrating the row.
  const currentState = rawState === "normal" ? "on_pool" : rawState;
  const match = findTransition(currentState, event, ctx);

  if (!match) {
    logger.warn(
      {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        currentState,
        event,
      },
      "[UserCreditStateMachine] No matching transition - skipping"
    );
    return new Err(
      new Error(
        `[UserCreditStateMachine] Illegal transition: ${currentState} + ${event.type}`
      )
    );
  }

  // Compare against the raw value so a legacy "normal" row is rewritten to the
  // canonical "on_pool" even when the normalized state already matches.
  if (rawState !== match.to) {
    await membership.updateCreditState(match.to, transaction);
  }
  syncUserCapCacheForState(match.to, ctx, transaction);
  logger.info(
    {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      fromState: rawState,
      toState: match.to,
      eventType: event.type,
      wasStateChanged: rawState !== match.to,
    },
    "[UserCreditStateMachine] Transition applied"
  );

  return new Ok(match.to);
}

/**
 * Authoritatively set a user's credit state to `targetState`, bypassing the
 * event/transition graph. Used by reconciliation, which computes the expected
 * state directly from the live source of truth (Metronome seat balance + cap +
 * usage) — the seat↔pool dimension is not reachable from the event-driven
 * transitions alone (e.g. nothing dispatches a user back to `user_seat` outside
 * a billing-cycle webhook). Persists the new state (treating the legacy
 * "normal" alias as "on_pool" so such rows migrate) and syncs the same caches
 * the transitions do.
 */
export async function setUserCreditStateReconciled(
  membership: MembershipResource,
  targetState: UserCreditState,
  ctx: UserCreditContext,
  { transaction }: { transaction?: Transaction } = {}
): Promise<UserCreditState> {
  const rawState = membership.creditState;
  if (rawState !== targetState) {
    await membership.updateCreditState(targetState, transaction);
  }
  syncUserCapCacheForState(targetState, ctx, transaction);
  logger.info(
    {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      fromState: rawState,
      toState: targetState,
      wasStateChanged: rawState !== targetState,
    },
    "[UserCreditStateMachine] State reconciled"
  );
  return targetState;
}
