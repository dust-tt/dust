import {
  clearUserCapBlocked,
  setUserCapBlocked,
} from "@app/lib/metronome/user_block";
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
  | { type: "admin_raised_user_cap" };

type SideEffect = (
  ctx: UserCreditContext,
  transaction: Transaction | undefined
) => void;

type UserCreditTransition = {
  from: UserCreditState;
  event: UserCreditEvent["type"];
  to: UserCreditState;
  onTransition: SideEffect;
};

const setBlocked: SideEffect = (ctx, tx) => {
  invalidateCacheAfterCommit(tx, () =>
    setUserCapBlocked(ctx.workspaceId, ctx.userId)
  );
};

const clearBlocked: SideEffect = (ctx, tx) => {
  invalidateCacheAfterCommit(tx, () =>
    clearUserCapBlocked(ctx.workspaceId, ctx.userId)
  );
};

const TRANSITIONS: UserCreditTransition[] = [
  {
    from: "normal",
    event: "per_user_cap_reached",
    to: "capped",
    onTransition: setBlocked,
  },
  {
    from: "capped",
    event: "admin_raised_user_cap",
    to: "normal",
    onTransition: clearBlocked,
  },
  {
    from: "capped",
    event: "per_user_cap_resolved",
    to: "normal",
    onTransition: clearBlocked,
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

  await membership.updateCreditState(match.to, transaction);
  match.onTransition(ctx, transaction);
  logger.info(
    {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      fromState: currentState,
      toState: match.to,
      eventType: event.type,
    },
    "[UserCreditStateMachine] Transition applied"
  );

  return new Ok(match.to);
}
