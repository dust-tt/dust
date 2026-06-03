import { setUserCreditStatus } from "@app/lib/metronome/user_block";
import type { MembershipResource } from "@app/lib/resources/membership_resource";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { UserCreditState } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Transaction } from "sequelize";

export type UserCreditContext = {
  workspaceId: string;
  userId: string;
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
   * This user crossed the 80% spend-warning threshold while spending from the
   * workspace pool. Surfaces the low-balance warning without hard-blocking.
   */
  | { type: "spend_threshold_reached" }
  /**
   * This user's personal (seat) credit balance reached 0. Triggered by the
   * per-seat `alerts.low_remaining_seat_balance_reached` Metronome alert. The
   * user falls back to spending from the workspace pool.
   */
  | { type: "seat_balance_exhausted" }
  /**
   * This user's personal (seat) credit balance is running low (still > 0).
   * Triggered by the low-threshold per-seat `low_remaining_seat_balance_reached`
   * alert. Surfaces the low-balance warning while still on personal credits.
   */
  | { type: "seat_balance_low" };

type UserCreditTransition = {
  from: UserCreditState;
  event: UserCreditEvent["type"];
  to: UserCreditState;
};

// Mirror the new credit state into the Redis fast-path cache (gated on DB
// commit). The cache holds the raw state; `isUserBlocked` / `isUserAwuWarned`
// derive blocked/warned from it.
function syncUserCapCacheForState(
  state: UserCreditState,
  ctx: UserCreditContext,
  transaction: Transaction | undefined
): void {
  invalidateCacheAfterCommit(transaction, () =>
    setUserCreditStatus(ctx.workspaceId, ctx.userId, state)
  );
}

const TRANSITIONS: UserCreditTransition[] = [
  {
    from: "on_pool",
    event: "per_user_cap_reached",
    to: "capped",
  },
  {
    from: "capped",
    event: "per_user_cap_reached",
    to: "capped",
  },
  {
    from: "capped",
    event: "admin_raised_user_cap",
    to: "on_pool",
  },
  {
    from: "on_pool",
    event: "admin_raised_user_cap",
    to: "on_pool",
  },
  {
    from: "capped",
    event: "per_user_cap_resolved",
    to: "on_pool",
  },
  {
    from: "on_pool",
    event: "per_user_cap_resolved",
    to: "on_pool",
  },
  {
    from: "on_pool",
    event: "spend_threshold_reached",
    to: "on_pool_low_balance",
  },
  {
    from: "on_pool_low_balance",
    event: "spend_threshold_reached",
    to: "on_pool_low_balance",
  },
  // Personal (seat) credits exhausted: fall back to the workspace pool. Users
  // already on the pool (or capped) stay where they are — the seat-credit
  // phase is behind them.
  {
    from: "user_seat",
    event: "seat_balance_exhausted",
    to: "on_pool",
  },
  {
    from: "user_seat_low_balance",
    event: "seat_balance_exhausted",
    to: "on_pool",
  },
  {
    from: "on_pool",
    event: "seat_balance_exhausted",
    to: "on_pool",
  },
  {
    from: "on_pool_low_balance",
    event: "seat_balance_exhausted",
    to: "on_pool_low_balance",
  },
  {
    from: "capped",
    event: "seat_balance_exhausted",
    to: "capped",
  },
  // Personal (seat) credits running low (still > 0): surface the warning while
  // still on personal credits. Users already past the seat phase (on the pool
  // or capped) stay where they are.
  {
    from: "user_seat",
    event: "seat_balance_low",
    to: "user_seat_low_balance",
  },
  {
    from: "user_seat_low_balance",
    event: "seat_balance_low",
    to: "user_seat_low_balance",
  },
  {
    from: "on_pool",
    event: "seat_balance_low",
    to: "on_pool",
  },
  {
    from: "on_pool_low_balance",
    event: "seat_balance_low",
    to: "on_pool_low_balance",
  },
  {
    from: "capped",
    event: "seat_balance_low",
    to: "capped",
  },
];

function findTransition(
  current: UserCreditState,
  event: UserCreditEvent
): UserCreditTransition | undefined {
  return TRANSITIONS.find((t) => t.from === current && t.event === event.type);
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
  const match = findTransition(currentState, event);

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
 * Force-reset a user's credit state to `state`, bypassing the transition table.
 * Used at billing-cycle boundaries: when seat and pool credits refill, every
 * user returns to their starting state (`user_seat` for seat-based users,
 * `on_pool` otherwise) regardless of where they ended the prior period. Syncs
 * the Redis cap/warning flags to match the target state.
 */
export async function resetUserCreditState(
  membership: MembershipResource,
  state: UserCreditState,
  ctx: UserCreditContext,
  { transaction }: { transaction?: Transaction } = {}
): Promise<void> {
  if (membership.creditState !== state) {
    await membership.updateCreditState(state, transaction);
  }
  syncUserCapCacheForState(state, ctx, transaction);
}
