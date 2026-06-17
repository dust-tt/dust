import {
  MAX_SEAT_MONTHLY_AWU_CREDITS,
  PRO_SEAT_MONTHLY_AWU_CREDITS,
} from "@app/lib/metronome/constants";
import { setUserCreditState } from "@app/lib/metronome/user_block";
import type { MembershipResource } from "@app/lib/resources/membership_resource";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type {
  MembershipSeatType,
  UserCreditState,
} from "@app/types/memberships";
import {
  CAP_WARNING_FRACTION,
  expectedUserCreditState,
  isSeatBased,
  SEAT_LOW_BALANCE_FRACTION,
} from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Transaction } from "sequelize";

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
  /**
   * The user's effective pool budget in AWU credits: `0` = no pool access
   * (e.g. free seats), `> 0` = capped pool, `null` = unlimited. A property of
   * the user's situation (like `remainingCapCreditsPercentage`), so it lives in
   * the context — it's what the `seat_balance_exhausted` guards use to route
   * `capped` vs `on_pool`, with no seat-type special-casing.
   */
  poolLimitAwuCredits?: number | null;
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
   * This user's personal seat balance is exhausted. The next state is decided
   * by `ctx.poolLimitAwuCredits`:
   *   - `0` (no pool access, e.g. free seats) → `capped`
   *   - `> 0` or `null` (unlimited) → `on_pool` (band depends on cap usage)
   */
  | { type: "seat_balance_exhausted" }
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
  | { type: "seat_balance_resolved" };

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

// Seat↔pool band a user should land in once a blocking dimension clears (a
// per-user cap resolving, or a seat balance replenishing), derived from the
// live balance snapshot carried in the context. Used by the guards on the
// `per_user_cap_resolved` / `seat_balance_resolved` transitions below
// (mirroring how the `seat_balance_exhausted` guards branch on seat type / pool
// limit). Without a snapshot we can't distinguish seat from pool, so default to
// the pool.
function targetBandFromLiveBalance(ctx: UserCreditContext): UserCreditState {
  if (!ctx.liveBalance) {
    return "on_pool";
  }
  return expectedUserCreditState({
    seatType: ctx.seatType ?? null,
    ...ctx.liveBalance,
  });
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
    guard: (ctx) => targetBandFromLiveBalance(ctx) === "user_seat",
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
    guard: (ctx) => targetBandFromLiveBalance(ctx) === "user_seat_low_balance",
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
    guard: (ctx) => targetBandFromLiveBalance(ctx) === "on_pool_low_balance",
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
  // Seat balance exhausted. Routing is driven by `ctx.poolLimitAwuCredits`, not
  // the seat type — a no-pool seat (free) simply has poolLimit 0. Order matters:
  // most specific guard first.
  //  1. No pool budget (poolLimit 0, incl. free) or per-user cap also exhausted
  //     → capped.
  {
    from: ["user_seat", "user_seat_low_balance", "capped"],
    event: "seat_balance_exhausted",
    guard: (ctx) =>
      ctx.poolLimitAwuCredits === 0 || ctx.remainingCapCreditsPercentage === 0,
    to: "capped",
  },
  //  2. Pool budget left but < 20 % of cap remaining → on_pool_low_balance.
  {
    from: ["user_seat", "user_seat_low_balance"],
    event: "seat_balance_exhausted",
    guard: (ctx) =>
      ctx.remainingCapCreditsPercentage != null &&
      ctx.remainingCapCreditsPercentage < 1 - CAP_WARNING_FRACTION,
    to: "on_pool_low_balance",
  },
  //  3. Pool budget left (poolLimit > 0 or null/unlimited) → on_pool.
  {
    from: ["user_seat", "user_seat_low_balance", "on_pool"],
    event: "seat_balance_exhausted",
    guard: (ctx) => ctx.poolLimitAwuCredits !== 0,
    to: "on_pool",
  },

  // Seat low-balance warning (balance > 0). Guards match threshold to seat
  // type so only the intended seats transition.
  {
    from: ["user_seat", "user_seat_low_balance"],
    event: "seat_low_balance",
    guard: (ctx, event) =>
      event.type === "seat_low_balance" &&
      event.threshold ===
        SEAT_LOW_BALANCE_FRACTION * MAX_SEAT_MONTHLY_AWU_CREDITS &&
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
  // Free seats: the per-user credit-balance alert is scoped to this one user
  // (not a workspace-wide fan-out), so it's always relevant — no threshold
  // disambiguation needed. Match on seat type alone, with no hardcoded
  // threshold value.
  {
    from: ["user_seat", "user_seat_low_balance"],
    event: "seat_low_balance",
    guard: (ctx) => ctx.seatType === "free",
    to: "user_seat_low_balance",
  },

  // Seat balance replenished — for pro/max a billing-period renewal, for free a
  // fresh credit clearing its low/empty alert. Reset any seat-based user
  // (pro/max/free) from any state, including `capped` (a free seat exhausted to
  // 0 is `capped`, so it must be reachable here). The live balance decides the
  // band: a partial refill that's still under the low-balance threshold lands
  // in `user_seat_low_balance`, otherwise `user_seat`. Workspace (pool-based)
  // seats have no seat balance and are reset by per_user_cap_resolved instead.
  {
    from: [
      "user_seat",
      "user_seat_low_balance",
      "on_pool",
      "on_pool_low_balance",
      "capped",
    ],
    event: "seat_balance_resolved",
    guard: (ctx) =>
      isSeatBased(ctx.seatType) &&
      targetBandFromLiveBalance(ctx) === "user_seat_low_balance",
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
    event: "seat_balance_resolved",
    guard: (ctx) => isSeatBased(ctx.seatType),
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
        fromState: currentState,
        event,
        eventType: event.type,
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
  invalidateCacheAfterCommit(transaction, () =>
    setUserCreditState(ctx.workspaceId, ctx.userId, match.to)
  );
  logger.info(
    {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      fromState: rawState,
      toState: match.to,
      event,
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
  invalidateCacheAfterCommit(transaction, () =>
    setUserCreditState(ctx.workspaceId, ctx.userId, targetState)
  );
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
