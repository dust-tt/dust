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
  /** Pool balance dropped below a warning threshold. */
  | { type: "low_balance"; balanceAwu: number };

// Thresholds for low-balance state routing (in AWU credits).
const LOW_BALANCE_THRESHOLD_AWU = 100;
const CRITICAL_BALANCE_THRESHOLD_AWU = 10;

/**
 * The canonical pool credit state implied purely by the current AWU balance
 * and whether PAYG is enabled. This mirrors what `syncPoolCreditStateFromBalance`
 * produces by dispatching `credits_added` / `pool_exhausted` through the
 * machine, expressed as a pure function so callers can *check* whether the
 * persisted `workspace.poolCreditState` has drifted from reality without
 * mutating anything.
 *
 *   balance <= 0            -> overage (PAYG on) / depleted (PAYG off)
 *   0 < balance <= 10       -> active_critical_balance
 *   10 < balance <= 100     -> active_low_balance
 *   balance > 100           -> active
 */
export function expectedPoolCreditStateFromBalance({
  balanceAwu,
  paygEnabled,
}: {
  balanceAwu: number;
  paygEnabled: boolean;
}): WorkspacePoolCreditState {
  if (balanceAwu <= 0) {
    return paygEnabled ? "overage" : "depleted";
  }
  if (balanceAwu <= CRITICAL_BALANCE_THRESHOLD_AWU) {
    return "active_critical_balance";
  }
  if (balanceAwu <= LOW_BALANCE_THRESHOLD_AWU) {
    return "active_low_balance";
  }
  return "active";
}

type WorkspaceCreditGuard = (
  ctx: WorkspaceCreditContext,
  event: WorkspaceCreditEvent
) => boolean;

type WorkspaceCreditTransition = {
  from: WorkspacePoolCreditState | WorkspacePoolCreditState[];
  event: WorkspaceCreditEvent["type"];
  guard?: WorkspaceCreditGuard;
  to: WorkspacePoolCreditState;
};

function balanceAtMost(threshold: number): WorkspaceCreditGuard {
  return (_ctx, event) =>
    "balanceAwu" in event && event.balanceAwu <= threshold;
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
  // the recurring pool commit) always set the state back to active (with potential low balance).
  // Order matters: first match wins, so critical < low < default.
  {
    from: [
      "active",
      "active_low_balance",
      "active_critical_balance",
      "depleted",
      "overage",
    ],
    event: "credits_added",
    guard: balanceAtMost(CRITICAL_BALANCE_THRESHOLD_AWU),
    to: "active_critical_balance",
  },
  {
    from: [
      "active",
      "active_low_balance",
      "active_critical_balance",
      "depleted",
      "overage",
    ],
    event: "credits_added",
    guard: balanceAtMost(LOW_BALANCE_THRESHOLD_AWU),
    to: "active_low_balance",
  },
  {
    from: [
      "active",
      "active_low_balance",
      "active_critical_balance",
      "depleted",
      "overage",
    ],
    event: "credits_added",
    to: "active",
  },
  {
    from: [
      "active",
      "active_low_balance",
      "active_critical_balance",
      "overage",
      // A `pool_exhausted` event re-fired while already in `depleted` (e.g.
      // `syncPoolCreditStateFromBalance` running after PAYG was just enabled)
      // must promote the workspace to `overage` — without this entry the
      // workspace would stay stuck in `depleted` until the next `payg_enabled`.
      "depleted",
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

  // Low balance alerts. No throttling when PAYG is enabled.
  // Order matters: first match wins, so critical < low < no-op.
  {
    from: ["active", "active_low_balance"],
    event: "low_balance",
    guard: (ctx, event) =>
      !ctx.paygEnabled &&
      balanceAtMost(CRITICAL_BALANCE_THRESHOLD_AWU)(ctx, event),
    to: "active_critical_balance",
  },

  // active -> ...
  {
    from: "active",
    event: "low_balance", // critical balance already matched
    guard: (ctx) => !ctx.paygEnabled,
    to: "active_low_balance",
  },
  {
    from: "active",
    event: "low_balance",
    to: "active",
  },
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

  // active_low_balance -> ...
  {
    from: "active_low_balance",
    event: "low_balance", // critical balance already matched before
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
    event: "low_balance",
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
  // Note: `depleted + pool_exhausted` is handled by the top-level array
  // transitions: `paygEnabled → overage` and `!paygEnabled → depleted` both
  // include `"depleted"` in their `from` lists.
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
    return (
      fromMatch && t.event === event.type && (!t.guard || t.guard(ctx, event))
    );
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

  if (currentState !== match.to) {
    await workspace.updatePoolCreditState(match.to, transaction);
  }
  syncWorkspacePoolCacheForState(match.to, ctx, transaction);
  logger.info(
    {
      workspaceId: ctx.workspaceId,
      fromState: currentState,
      toState: match.to,
      eventType: event.type,
      wasStateChanged: currentState !== match.to,
    },
    "[WorkspaceCreditStateMachine] Transition applied"
  );

  return new Ok(match.to);
}

/**
 * Authoritatively set the workspace pool credit state to `targetState`,
 * bypassing the event/transition graph. Used by reconciliation, which computes
 * the expected state directly from the live AWU balance + PAYG via
 * `expectedPoolCreditStateFromBalance`. Persists the new state and syncs the
 * same caches the transitions do.
 */
export async function setWorkspacePoolCreditStateReconciled(
  workspace: WorkspaceResource,
  targetState: WorkspacePoolCreditState,
  ctx: WorkspaceCreditContext,
  { transaction }: { transaction?: Transaction } = {}
): Promise<WorkspacePoolCreditState> {
  const currentState = workspace.poolCreditState;
  if (currentState !== targetState) {
    await workspace.updatePoolCreditState(targetState, transaction);
  }
  syncWorkspacePoolCacheForState(targetState, ctx, transaction);
  logger.info(
    {
      workspaceId: ctx.workspaceId,
      fromState: currentState,
      toState: targetState,
      wasStateChanged: currentState !== targetState,
    },
    "[WorkspaceCreditStateMachine] State reconciled"
  );
  return targetState;
}
