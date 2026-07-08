import { setApiKeyCreditState } from "@app/lib/metronome/api_key_block";
import type { KeyResource } from "@app/lib/resources/key_resource";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { ApiKeyCreditState } from "@app/types/key";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Transaction } from "sequelize";

export type ApiKeyCreditContext = {
  workspaceId: string;
  keyModelId: number;
};

/**
 * Derive the expected per-key credit state from live usage vs. the configured
 * cap. `capAwuCredits === null` means no cap (unlimited) → always `on_pool`.
 * Used by reconciliation. Mirrors the Metronome alert threshold (`reached`
 * fires at spend >= cap), so the two agree.
 */
export function expectedApiKeyCreditStateFromUsage({
  spentAwuCredits,
  capAwuCredits,
}: {
  spentAwuCredits: number;
  capAwuCredits: number | null;
}): ApiKeyCreditState {
  if (capAwuCredits === null) {
    return "on_pool";
  }
  return spentAwuCredits >= capAwuCredits ? "capped" : "on_pool";
}

export type ApiKeyCreditEvent =
  /** This key hit its admin-configured per-key spend cap. */
  | { type: "api_key_cap_reached" }
  /**
   * This key's spend dropped back below the cap — fires at billing-cycle
   * renewal (current_spend resets to 0) via
   * `alerts.spend_threshold_resolved`.
   */
  | { type: "api_key_cap_resolved" }
  /**
   * Admin raised or removed the per-key cap: unblock the key immediately
   * instead of waiting for the next billing-cycle resolve.
   */
  | { type: "admin_cap_cleared" };

type ApiKeyCreditTransition = {
  from: ApiKeyCreditState | ApiKeyCreditState[];
  event: ApiKeyCreditEvent["type"];
  to: ApiKeyCreditState;
};

const TRANSITIONS: ApiKeyCreditTransition[] = [
  {
    from: ["on_pool", "capped"],
    event: "api_key_cap_reached",
    to: "capped",
  },
  {
    from: ["on_pool", "capped"],
    event: "api_key_cap_resolved",
    to: "on_pool",
  },
  {
    from: ["on_pool", "capped"],
    event: "admin_cap_cleared",
    to: "on_pool",
  },
];

function findTransition(
  current: ApiKeyCreditState,
  event: ApiKeyCreditEvent
): ApiKeyCreditTransition | undefined {
  return TRANSITIONS.find((t) => {
    const fromMatch = Array.isArray(t.from)
      ? t.from.includes(current)
      : t.from === current;
    return fromMatch && t.event === event.type;
  });
}

export async function transitionApiKeyCreditState(
  key: KeyResource,
  event: ApiKeyCreditEvent,
  ctx: ApiKeyCreditContext,
  { transaction }: { transaction?: Transaction } = {}
): Promise<Result<ApiKeyCreditState, Error>> {
  const currentState = key.creditState;
  const match = findTransition(currentState, event);

  if (!match) {
    logger.warn(
      {
        workspaceId: ctx.workspaceId,
        keyModelId: ctx.keyModelId,
        fromState: currentState,
        eventType: event.type,
      },
      "[ApiKeyCreditStateMachine] No matching transition - skipping"
    );
    return new Err(
      new Error(
        `[ApiKeyCreditStateMachine] Illegal transition: ${currentState} + ${event.type}`
      )
    );
  }

  if (currentState !== match.to) {
    await key.updateCreditState(match.to, transaction);
  }
  invalidateCacheAfterCommit(transaction, () =>
    setApiKeyCreditState(ctx.workspaceId, ctx.keyModelId, match.to)
  );
  logger.info(
    {
      workspaceId: ctx.workspaceId,
      keyModelId: ctx.keyModelId,
      fromState: currentState,
      toState: match.to,
      eventType: event.type,
      wasStateChanged: currentState !== match.to,
    },
    "[ApiKeyCreditStateMachine] Transition applied"
  );

  return new Ok(match.to);
}

/**
 * Authoritatively set an API key's credit state to `targetState`, bypassing
 * the event/transition graph. Used by reconciliation, which computes the
 * expected state directly from live Metronome usage vs. the configured cap.
 * Persists the new state and syncs the same cache the transitions do.
 */
export async function setApiKeyCreditStateReconciled(
  key: KeyResource,
  targetState: ApiKeyCreditState,
  ctx: ApiKeyCreditContext,
  { transaction }: { transaction?: Transaction } = {}
): Promise<ApiKeyCreditState> {
  const currentState = key.creditState;
  if (currentState !== targetState) {
    await key.updateCreditState(targetState, transaction);
  }
  invalidateCacheAfterCommit(transaction, () =>
    setApiKeyCreditState(ctx.workspaceId, ctx.keyModelId, targetState)
  );
  if (currentState !== targetState) {
    logger.info(
      {
        workspaceId: ctx.workspaceId,
        keyModelId: ctx.keyModelId,
        fromState: currentState,
        toState: targetState,
      },
      "[ApiKeyCreditStateMachine] State reconciled"
    );
  }
  return targetState;
}
