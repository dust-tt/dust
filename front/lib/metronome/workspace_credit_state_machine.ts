import {
  clearWorkspacePoolDepleted,
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
  | { type: "credits_added" };

type WorkspaceCreditTransition = {
  from: WorkspacePoolCreditState | WorkspacePoolCreditState[];
  event: WorkspaceCreditEvent["type"];
  guard?: (ctx: WorkspaceCreditContext) => boolean;
  to: WorkspacePoolCreditState;
};

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
      return;

    case "depleted":
      invalidateCacheAfterCommit(transaction, () =>
        setWorkspacePoolDepleted(ctx.workspaceId)
      );
      return;

    default:
      assertNever(state);
  }
}

const TRANSITIONS: WorkspaceCreditTransition[] = [
  // active -> ...
  {
    from: "active",
    event: "pool_exhausted",
    guard: (ctx) => ctx.paygEnabled,
    to: "overage",
  },
  {
    from: "active",
    event: "pool_exhausted",
    guard: (ctx) => !ctx.paygEnabled,
    to: "depleted",
  },
  {
    from: "active",
    event: "credits_added",
    to: "active",
  },

  // overage -> ...
  {
    from: "overage",
    event: "pool_exhausted",
    guard: (ctx) => ctx.paygEnabled,
    to: "overage",
  },
  {
    from: "overage",
    event: "payg_cap_reached",
    to: "depleted",
  },
  // A new commit segment starting (admin top-up or billing-cycle renewal of
  // the recurring pool commit) while in PAYG mode brings the pool back online
  // no need to keep spending against PAYG
  {
    from: "overage",
    event: "credits_added",
    to: "active",
  },

  // depleted -> ...
  {
    from: "depleted",
    event: "pool_exhausted",
    guard: (ctx) => !ctx.paygEnabled,
    to: "depleted",
  },
  {
    from: "depleted",
    event: "payg_cap_reached",
    to: "depleted",
  },
  {
    from: "depleted",
    event: "credits_added",
    to: "active",
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
