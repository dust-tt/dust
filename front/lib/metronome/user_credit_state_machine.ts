// Tracks the per-user credit consumption state within a workspace.
//
// Design principle: the workspace-level billing environment (plan type, PAYG
// config, pool balance) is owned by SubscriptionResource and the Metronome
// contract. This machine reads that data as immutable context at transition
// time (WorkspaceCreditContext) and only manages the user-scoped dimension.
//
// Persistence:
//   Source of truth — MembershipModel.creditState (DB column).
//   Fast-path cache — user_block.ts Redis key (derived, populated by
//   onTransition side-effects; cleared on reset/unblock transitions).
//
// All plan types are unified under the same five states. The plan type only
// affects which transitions are available, expressed as guard conditions that
// read from WorkspaceCreditContext.

import type { Transaction } from "sequelize";

import {
  clearUserBlocked,
  setUserBlocked,
} from "@app/lib/metronome/user_block";
import type { MembershipResource } from "@app/lib/resources/membership_resource";
import logger from "@app/logger/logger";
import type {
  MembershipSeatType,
  UserCreditState,
} from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * Immutable snapshot of the workspace billing environment, built once per
 * transition call from SubscriptionResource + Metronome contract + Redis cache.
 *
 * The state machine reads this as guard input. It never queries the subscription
 * directly, which keeps every transition independently unit-testable.
 */
export type WorkspaceCreditContext = {
  workspaceSId: string;
  userId: string;
  /** Current seat type of the user (from MembershipModel.seatType). */
  seatType: MembershipSeatType;
  /** True when the workspace pool (commit balance) is currently non-zero. */
  hasWorkspacePool: boolean;
  /** True when PAYG overage is enabled on the Metronome contract. */
  paygEnabled: boolean;
  /**
   * True when an exhausted free seat should auto-upgrade to the lowest paid
   * tier instead of blocking. Open product decision — defaults to false.
   */
  autoUpgradeEnabled: boolean;
};

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type UserCreditEvent =
  /** Individual bundle credits reached zero (Metronome spend_threshold_reached). */
  | { type: "bundle_exhausted" }
  /** Workspace pool commit balance reached zero (low_remaining_commit_balance). */
  | { type: "pool_exhausted" }
  /** Overage spend cap reached (Metronome spend_threshold_reached on cap alert). */
  | { type: "overage_cap_reached" }
  /** New billing period started — bundle / pool credits refreshed. */
  | { type: "credits_reset" }
  /** Admin topped up the workspace pool (commit.create webhook). */
  | { type: "credits_added" }
  /** Admin raised the per-user spend cap (Enterprise Pooled only). */
  | { type: "user_cap_raised" }
  /** Admin assigned or changed the user's seat type. */
  | { type: "seat_assigned"; seatType: MembershipSeatType };

// ---------------------------------------------------------------------------
// Transition table
// ---------------------------------------------------------------------------

type SideEffect = (
  event: UserCreditEvent,
  ctx: WorkspaceCreditContext
) => Promise<void>;

type UserCreditTransition = {
  from: UserCreditState | UserCreditState[];
  event: UserCreditEvent["type"];
  guard?: (event: UserCreditEvent, ctx: WorkspaceCreditContext) => boolean;
  to: UserCreditState;
  onTransition: SideEffect;
};

const noOp: SideEffect = async () => {};

const setBlocked: SideEffect = async (_, ctx) => {
  await setUserBlocked(ctx.workspaceSId, ctx.userId);
};

const clearBlocked: SideEffect = async (_, ctx) => {
  await clearUserBlocked(ctx.workspaceSId, ctx.userId);
};

const TRANSITIONS: UserCreditTransition[] = [
  // ── Free seat ─────────────────────────────────────────────────────────────
  // Free credits exhausted + auto-upgrade OFF → block
  {
    from: "free_active",
    event: "bundle_exhausted",
    guard: (_, ctx) => !ctx.autoUpgradeEnabled,
    to: "blocked",
    onTransition: setBlocked,
  },
  // Free credits exhausted + auto-upgrade ON → upgrade seat, start bundle
  // Note: caller is responsible for calling changeMetronomeSeatType after this.
  {
    from: "free_active",
    event: "bundle_exhausted",
    guard: (_, ctx) => ctx.autoUpgradeEnabled,
    to: "bundle_active",
    onTransition: noOp,
  },

  // ── Bundle seat (pro / max) ───────────────────────────────────────────────
  // Bundle exhausted + workspace pool available → fall through to pool
  {
    from: "bundle_active",
    event: "bundle_exhausted",
    guard: (_, ctx) => ctx.hasWorkspacePool,
    to: "pool_active",
    onTransition: noOp,
  },
  // Bundle exhausted + no pool + PAYG on → enter overage
  {
    from: "bundle_active",
    event: "bundle_exhausted",
    guard: (_, ctx) => !ctx.hasWorkspacePool && ctx.paygEnabled,
    to: "overage",
    onTransition: noOp,
  },
  // Bundle exhausted + no pool + PAYG off → block
  {
    from: "bundle_active",
    event: "bundle_exhausted",
    guard: (_, ctx) => !ctx.hasWorkspacePool && !ctx.paygEnabled,
    to: "blocked",
    onTransition: setBlocked,
  },

  // ── Pool (enterprise pooled primary, or pro/max fallback) ─────────────────
  // Pool exhausted + PAYG on → enter overage
  {
    from: "pool_active",
    event: "pool_exhausted",
    guard: (_, ctx) => ctx.paygEnabled,
    to: "overage",
    onTransition: noOp,
  },
  // Pool exhausted + PAYG off → block
  {
    from: "pool_active",
    event: "pool_exhausted",
    guard: (_, ctx) => !ctx.paygEnabled,
    to: "blocked",
    onTransition: setBlocked,
  },

  // ── Overage ───────────────────────────────────────────────────────────────
  {
    from: "overage",
    event: "overage_cap_reached",
    to: "blocked",
    onTransition: setBlocked,
  },

  // ── Billing period reset ──────────────────────────────────────────────────
  // New period: pro/max seat → back to individual bundle
  {
    from: ["blocked", "overage", "pool_active"],
    event: "credits_reset",
    guard: (_, ctx) => ctx.seatType === "pro" || ctx.seatType === "max",
    to: "bundle_active",
    onTransition: clearBlocked,
  },
  // New period: pooled seat → back to pool
  {
    from: ["blocked", "overage"],
    event: "credits_reset",
    guard: (_, ctx) => ctx.seatType === "pooled",
    to: "pool_active",
    onTransition: clearBlocked,
  },

  // ── Admin tops up pool ────────────────────────────────────────────────────
  {
    from: ["blocked", "overage"],
    event: "credits_added",
    to: "pool_active",
    onTransition: clearBlocked,
  },

  // ── Admin raises per-user cap (pooled seats only) ─────────────────────────
  {
    from: "blocked",
    event: "user_cap_raised",
    guard: (_, ctx) => ctx.seatType === "pooled",
    to: "pool_active",
    onTransition: clearBlocked,
  },

  // ── Seat assignment / type change ─────────────────────────────────────────
  // Assigning a paid bundle seat (pro/max) to a free or blocked user
  {
    from: ["free_active", "blocked"],
    event: "seat_assigned",
    guard: (event) =>
      event.type === "seat_assigned" &&
      (event.seatType === "pro" || event.seatType === "max"),
    to: "bundle_active",
    onTransition: clearBlocked,
  },
  // Assigning a pooled seat to any non-pool user
  {
    from: ["free_active", "bundle_active", "blocked"],
    event: "seat_assigned",
    guard: (event) =>
      event.type === "seat_assigned" && event.seatType === "pooled",
    to: "pool_active",
    onTransition: clearBlocked,
  },
  // Downgrading to free seat
  {
    from: ["bundle_active", "pool_active", "overage", "blocked"],
    event: "seat_assigned",
    guard: (event) =>
      event.type === "seat_assigned" && event.seatType === "free",
    to: "free_active",
    onTransition: clearBlocked,
  },
];

// ---------------------------------------------------------------------------
// Transition engine
// ---------------------------------------------------------------------------

function findTransition(
  current: UserCreditState,
  event: UserCreditEvent,
  ctx: WorkspaceCreditContext
): UserCreditTransition | undefined {
  return TRANSITIONS.find((t) => {
    const fromMatch = Array.isArray(t.from)
      ? t.from.includes(current)
      : t.from === current;
    return (
      fromMatch &&
      t.event === event.type &&
      (!t.guard || t.guard(event, ctx))
    );
  });
}

/**
 * Apply a credit-state transition for a single user.
 *
 * The caller is responsible for building a fresh WorkspaceCreditContext from
 * SubscriptionResource + Metronome contract + credit_balance cache before
 * calling this function.
 *
 * Side effects (Redis user_block key) are executed synchronously inside this
 * call. The new state is persisted on MembershipModel within the provided
 * transaction (or immediately if none is given).
 *
 * Returns Ok(newState) on success, Err on illegal / unmatched transition
 * (no side effects are applied in the error case).
 */
export async function transitionUserCreditState(
  membership: MembershipResource,
  event: UserCreditEvent,
  ctx: WorkspaceCreditContext,
  { transaction }: { transaction?: Transaction } = {}
): Promise<Result<UserCreditState, Error>> {
  const currentState = membership.creditState ?? "free_active";
  const match = findTransition(currentState, event, ctx);

  if (!match) {
    logger.warn(
      {
        workspaceId: ctx.workspaceSId,
        userId: ctx.userId,
        currentState,
        event,
      },
      "[UserCreditStateMachine] No matching transition — skipping"
    );
    return new Err(
      new Error(
        `[UserCreditStateMachine] Illegal transition: ${currentState} + ${event.type}`
      )
    );
  }

  // Side effects first; abort if they fail (DB write would be inconsistent).
  await match.onTransition(event, ctx);

  await membership.update({ creditState: match.to }, transaction);

  logger.info(
    {
      workspaceId: ctx.workspaceSId,
      userId: ctx.userId,
      fromState: currentState,
      toState: match.to,
      eventType: event.type,
    },
    "[UserCreditStateMachine] Transition applied"
  );

  return new Ok(match.to);
}
