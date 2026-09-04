import { setUserCreditState } from "@app/lib/metronome/user_block";
import type { MembershipResource } from "@app/lib/resources/membership_resource";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type {
  MembershipSeatType,
  UserCreditState,
} from "@app/types/memberships";
import { isSeatBased, normalizeUserCreditState } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Transaction } from "sequelize";

export type UserCreditContext = {
  workspaceId: string;
  userId: string;
  /** Seat type of the membership — required by guards on seat-balance transitions. */
  seatType?: MembershipSeatType | null;
  /**
   * The user's effective pool budget in AWU credits: `0` = no pool access
   * (e.g. free seats), `> 0` = pool access. The `seat_balance_exhausted`
   * transition routes on it: pool access → `on_pool`; no pool access (free
   * seats) → no transition (they stay `user_seat`; their blocking is the
   * rate-limiter lifetime cap). Absent for events that don't carry a resolved
   * pool limit.
   */
  poolLimitAwuCredits?: number;
};

type UserCreditEvent =
  /**
   * This user's personal seat balance is exhausted. Seats with pool access
   * (`ctx.poolLimitAwuCredits > 0`) fall back to `on_pool`; free seats (no pool)
   * stay `user_seat`.
   */
  | { type: "seat_balance_exhausted" }
  /**
   * Billing-period renewal: Metronome replenished this user's seat balance.
   * Only applies to seat-based seats. Resets the state back to `user_seat`.
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

const TRANSITIONS: UserCreditTransition[] = [
  // Seat balance exhausted: seats with pool access fall back to the pool. Free
  // seats (no pool access) have no matching transition and stay `user_seat`.
  {
    from: ["user_seat", "on_pool"],
    event: "seat_balance_exhausted",
    guard: (ctx) => ctx.poolLimitAwuCredits !== 0,
    to: "on_pool",
  },
  // Seat balance replenished — billing-period renewal. Resets any seat-based
  // user back to `user_seat`.
  {
    from: ["user_seat", "on_pool"],
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
  // Legacy rows may still hold pre-narrowing values (normal / *_low_balance /
  // capped) until the backfill migration lands; normalize so transitions match
  // and the next write persists the canonical value.
  const currentState = normalizeUserCreditState(rawState);
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
  const wasStateChanged = rawState !== targetState;
  if (wasStateChanged) {
    logger.info(
      {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        fromState: rawState,
        toState: targetState,
      },
      "[UserCreditStateMachine] State reconciled"
    );
  }
  return targetState;
}
