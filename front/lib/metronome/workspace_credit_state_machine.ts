import {
  clearWorkspacePoolDepleted,
  setWorkspaceCreditPoolStatus,
  setWorkspacePoolDepleted,
} from "@app/lib/metronome/user_block";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { WorkspacePoolCreditState } from "@app/types/credits";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Transaction } from "sequelize";

export type WorkspaceCreditContext = {
  workspaceId: string;
  paygEnabled: boolean;
};

export type WorkspaceCreditEvent =
  /** Workspace pool commit balance reached zero. */
  | { type: "pool_exhausted" }
  /** Workspace-level PAYG cap reached. */
  | { type: "payg_cap_reached" }
  /**
   * A new commit segment became spendable: either a billing-cycle renewal
   * of the recurring pool commit, or an admin top-up. From the workspace state
   * machine's point of view these are indistinguishable and both bring the
   * pool back online.
   */
  | { type: "credits_added"; balanceAwu: number }
  /**
   * PAYG was turned off by an operator. Workspaces in `overage` were
   * surviving on PAYG: with PAYG gone they have nothing left to spend, so
   * they must move to `depleted`. `active` workspaces are unaffected — the
   * pool will route correctly on the next `pool_exhausted`.
   */
  | { type: "payg_disabled" }
  /**
   * PAYG was turned on (or its cap raised) by an operator. Workspaces in
   * `depleted` that were blocked for lack of PAYG can now spend against it,
   * so they move to `overage`. `active` and `overage` workspaces are
   * unaffected.
   */
  | { type: "payg_enabled" }
  /** Pool balance dropped to ≤100 credits remaining. */
  | { type: "low_balance_100" }
  /** Pool balance dropped to ≤10 credits remaining. */
  | { type: "low_balance_10" };

// Thresholds for low-balance state routing (in credits).
const LOW_BALANCE_THRESHOLD = 100;
const CRITICAL_BALANCE_THRESHOLD = 10;

type WorkspaceCreditTransition = {
  from: WorkspacePoolCreditState | WorkspacePoolCreditState[];
  event: WorkspaceCreditEvent["type"];
  guard?: (ctx: WorkspaceCreditContext) => boolean;
  to:
    | WorkspacePoolCreditState
    | ((event: WorkspaceCreditEvent) => WorkspacePoolCreditState);
};

function resolveTargetState(
  to: WorkspaceCreditTransition["to"],
  event: WorkspaceCreditEvent
): WorkspacePoolCreditState {
  return typeof to === "function" ? to(event) : to;
}

function activeStateForBalance(
  event: WorkspaceCreditEvent
): WorkspacePoolCreditState {
  // Only valid for credits_added events, enforced by transition table
  if (event.type !== "credits_added") {
    throw new Error(
      `[WorkspaceCreditStateMachine] activeStateForBalance called with unexpected event: ${event.type}`
    );
  }
  if (event.balanceAwu <= CRITICAL_BALANCE_THRESHOLD) {
    return "active_critical_balance";
  }
  if (event.balanceAwu <= LOW_BALANCE_THRESHOLD) {
    return "active_low_balance";
  }
  return "active";
}

function syncWorkspacePoolCacheForState(
  state: WorkspacePoolCreditState,
  ctx: WorkspaceCreditContext,
  transaction: Transaction | undefined
): void {
  switch (state) {
    case "active":
    case "overage":
      invalidateCacheAfterCommit(transaction, () =>
        clearWorkspacePoolDepleted(ctx.workspaceId)
      );
      invalidateCacheAfterCommit(transaction, () =>
        setWorkspaceCreditPoolStatus(ctx.workspaceId, state)
      );
      return;

    case "active_low_balance":
    case "active_critical_balance":
      invalidateCacheAfterCommit(transaction, () =>
        clearWorkspacePoolDepleted(ctx.workspaceId)
      );
      invalidateCacheAfterCommit(transaction, () =>
        setWorkspaceCreditPoolStatus(ctx.workspaceId, state)
      );
      return;

    case "depleted":
      invalidateCacheAfterCommit(transaction, () =>
        setWorkspacePoolDepleted(ctx.workspaceId)
      );
      invalidateCacheAfterCommit(transaction, () =>
        setWorkspaceCreditPoolStatus(ctx.workspaceId, state)
      );
      return;

    default:
      assertNever(state);
  }
}

const TRANSITIONS: WorkspaceCreditTransition[] = [
  // Common transitions

  // A new commit segment starting (admin top-up or billing-cycle renewal of
  // the recurring pool commit) always set the state back to active (with potential low balance)
  {
    from: [
      "active",
      "active_low_balance",
      "active_critical_balance",
      "depleted",
      "overage",
    ],
    event: "credits_added",
    to: activeStateForBalance,
  },
  {
    from: [
      "active",
      "active_low_balance",
      "active_critical_balance",
      "overage",
    ],
    event: "pool_exhausted",
    guard: (ctx) => ctx.paygEnabled,
    to: "overage",
  },
  {
    from: [
      "active",
      "active_low_balance",
      "active_critical_balance",
      "depleted",
    ],
    event: "pool_exhausted",
    guard: (ctx) => !ctx.paygEnabled,
    to: "depleted",
  },

  // active -> ...
  {
    from: "active",
    event: "payg_enabled",
    to: "active",
  },
  {
    from: "active",
    event: "payg_disabled",
    to: "active",
  },
  // No throttling due to low balance when PAYG is enabled.
  {
    from: "active",
    event: "low_balance_100",
    guard: (ctx) => !ctx.paygEnabled,
    to: "active_low_balance",
  },
  {
    from: "active",
    event: "low_balance_100",
    guard: (ctx) => ctx.paygEnabled,
    to: "active",
  },
  // If the 10-credit alert fires before the 100-credit one (race), jump
  // directly to active_critical_balance.
  {
    from: "active",
    event: "low_balance_10",
    guard: (ctx) => !ctx.paygEnabled,
    to: "active_critical_balance",
  },
  {
    from: "active",
    event: "low_balance_10",
    guard: (ctx) => ctx.paygEnabled,
    to: "active",
  },

  // active_low_balance -> ...
  {
    from: "active_low_balance",
    event: "low_balance_100",
    to: "active_low_balance",
  },
  {
    from: "active_low_balance",
    event: "low_balance_10",
    guard: (ctx) => !ctx.paygEnabled,
    to: "active_critical_balance",
  },
  {
    from: "active_low_balance",
    event: "low_balance_10",
    guard: (ctx) => ctx.paygEnabled, // should not happen
    to: "active_low_balance",
  },
  {
    from: "active_low_balance",
    event: "payg_enabled",
    to: "active",
  },
  {
    from: "active_low_balance",
    event: "payg_disabled",
    to: "active_low_balance",
  },

  // active_critical_balance -> ...
  {
    from: "active_critical_balance",
    event: "low_balance_10", // should not happen
    to: "active_critical_balance",
  },
  {
    from: "active_critical_balance",
    event: "low_balance_100", // should not happen
    to: "active_critical_balance",
  },
  {
    from: "active_critical_balance",
    event: "payg_enabled",
    to: "active",
  },
  {
    from: "active_critical_balance",
    event: "payg_disabled",
    to: "active_critical_balance",
  },

  // overage -> ...
  {
    from: "overage",
    event: "payg_cap_reached",
    to: "depleted",
  },
  {
    from: "overage",
    event: "payg_disabled",
    to: "depleted",
  },
  {
    from: "overage",
    event: "payg_enabled",
    to: "overage",
  },

  // depleted -> ...
  {
    from: "depleted",
    event: "payg_cap_reached",
    to: "depleted",
  },
  {
    from: "depleted",
    event: "payg_enabled",
    to: "overage",
  },
  {
    from: "depleted",
    event: "payg_disabled",
    to: "depleted",
  },
];

function findTransition(
  current: WorkspacePoolCreditState,
  event: WorkspaceCreditEvent,
  ctx: WorkspaceCreditContext
): WorkspaceCreditTransition | undefined {
  return TRANSITIONS.find((t) => {
    const fromMatch = Array.isArray(t.from)
      ? t.from.includes(current)
      : t.from === current;
    return fromMatch && t.event === event.type && (!t.guard || t.guard(ctx));
  });
}

export async function transitionWorkspaceCreditState(
  workspace: WorkspaceResource,
  event: WorkspaceCreditEvent,
  ctx: WorkspaceCreditContext,
  { transaction }: { transaction?: Transaction } = {}
): Promise<Result<WorkspacePoolCreditState, Error>> {
  const currentState = workspace.poolCreditState;
  const match = findTransition(currentState, event, ctx);

  if (!match) {
    logger.warn(
      {
        workspaceId: ctx.workspaceId,
        currentState,
        event,
      },
      "[WorkspaceCreditStateMachine] No matching transition: skipping"
    );
    return new Err(
      new Error(
        `[WorkspaceCreditStateMachine] Illegal transition: ${currentState} + ${event.type}`
      )
    );
  }

  const targetState = resolveTargetState(match.to, event);

  if (currentState !== targetState) {
    await workspace.updatePoolCreditState(targetState, transaction);
  }
  syncWorkspacePoolCacheForState(targetState, ctx, transaction);
  logger.info(
    {
      workspaceId: ctx.workspaceId,
      fromState: currentState,
      toState: targetState,
      eventType: event.type,
      wasStateChanged: currentState !== targetState,
    },
    "[WorkspaceCreditStateMachine] Transition applied"
  );

  return new Ok(targetState);
}
