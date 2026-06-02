import {
  clearUserAwuWarned,
  clearUserCapBlocked,
  setUserAwuWarned,
  setUserCapBlocked,
} from "@app/lib/metronome/user_block";
import type { MembershipResource } from "@app/lib/resources/membership_resource";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { UserCreditState } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
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
  | { type: "admin_raised_user_cap" };

type UserCreditTransition = {
  from: UserCreditState;
  event: UserCreditEvent["type"];
  to: UserCreditState;
};

function syncUserCapCacheForState(
  state: UserCreditState,
  ctx: UserCreditContext,
  transaction: Transaction | undefined
): void {
  switch (state) {
    // Spending normally (personal credits or workspace pool): not capped, no
    // low-balance warning.
    case "user_seat":
    case "on_pool":
      invalidateCacheAfterCommit(transaction, () =>
        clearUserCapBlocked(ctx.workspaceId, ctx.userId)
      );
      invalidateCacheAfterCommit(transaction, () =>
        clearUserAwuWarned(ctx.workspaceId, ctx.userId)
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
      return;

    case "capped":
      invalidateCacheAfterCommit(transaction, () =>
        setUserCapBlocked(ctx.workspaceId, ctx.userId)
      );
      return;

    default:
      assertNever(state);
  }
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
  const currentState = membership.creditState;
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

  if (currentState !== match.to) {
    await membership.updateCreditState(match.to, transaction);
  }
  syncUserCapCacheForState(match.to, ctx, transaction);
  logger.info(
    {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      fromState: currentState,
      toState: match.to,
      eventType: event.type,
      wasStateChanged: currentState !== match.to,
    },
    "[UserCreditStateMachine] Transition applied"
  );

  return new Ok(match.to);
}
