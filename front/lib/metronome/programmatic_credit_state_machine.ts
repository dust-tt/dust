import { CRITICAL_BALANCE_OFFSET } from "@app/lib/metronome/alerts/programmatic_cap";
import {
  clearWorkspaceProgrammaticDepleted,
  setWorkspaceProgrammaticCreditStatus,
  setWorkspaceProgrammaticDepleted,
} from "@app/lib/metronome/user_block";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { WorkspaceProgrammaticCreditState } from "@app/types/credits";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Transaction } from "sequelize";

export type ProgrammaticCreditEvent =
  /** Spending approaching the cap. `remainingCredits` is how many credits
   *  remain before the cap (e.g. 100 or 10). */
  | { type: "programmatic_low_balance"; remainingCredits: number }
  /** Spending reached the monthly cap. */
  | { type: "programmatic_cap_reached" }
  /** Cap reset (new billing period or cap removed/raised). */
  | { type: "programmatic_cap_reset" };

/**
 * The canonical programmatic credit state implied purely by which of the
 * monthly-cap spend-threshold alerts are currently in alarm. This mirrors what
 * the webhook routing produces by dispatching `programmatic_cap_reached` /
 * `programmatic_low_balance` / `programmatic_cap_reset` through the machine,
 * expressed as a pure function so callers can *check* whether the persisted
 * `workspace.programmaticCreditState` has drifted from reality without mutating
 * anything.
 *
 *   cap in alarm        -> depleted
 *   critical in alarm   -> active_critical_balance
 *   low in alarm        -> active_low_balance
 *   none in alarm (or
 *   no cap configured)  -> active
 */
export function expectedProgrammaticCreditStateFromAlerts({
  capInAlarm,
  criticalInAlarm,
  lowInAlarm,
}: {
  capInAlarm: boolean;
  criticalInAlarm: boolean;
  lowInAlarm: boolean;
}): WorkspaceProgrammaticCreditState {
  if (capInAlarm) {
    return "depleted";
  }
  if (criticalInAlarm) {
    return "active_critical_balance";
  }
  if (lowInAlarm) {
    return "active_low_balance";
  }
  return "active";
}

type ProgrammaticCreditGuard = (event: ProgrammaticCreditEvent) => boolean;

type ProgrammaticCreditTransition = {
  from: WorkspaceProgrammaticCreditState | WorkspaceProgrammaticCreditState[];
  event: ProgrammaticCreditEvent["type"];
  guard?: ProgrammaticCreditGuard;
  to: WorkspaceProgrammaticCreditState;
};

function remainingAtMost(threshold: number): ProgrammaticCreditGuard {
  return (event) =>
    event.type === "programmatic_low_balance" &&
    event.remainingCredits <= threshold;
}

function syncProgrammaticCacheForState(
  state: WorkspaceProgrammaticCreditState,
  workspaceId: string,
  transaction: Transaction | undefined
): void {
  switch (state) {
    case "active":
    case "active_low_balance":
    case "active_critical_balance":
      invalidateCacheAfterCommit(transaction, () =>
        clearWorkspaceProgrammaticDepleted(workspaceId)
      );
      invalidateCacheAfterCommit(transaction, () =>
        setWorkspaceProgrammaticCreditStatus(workspaceId, state)
      );
      return;

    case "depleted":
      invalidateCacheAfterCommit(transaction, () =>
        setWorkspaceProgrammaticDepleted(workspaceId)
      );
      invalidateCacheAfterCommit(transaction, () =>
        setWorkspaceProgrammaticCreditStatus(workspaceId, state)
      );
      return;

    default:
      assertNever(state);
  }
}

const TRANSITIONS: ProgrammaticCreditTransition[] = [
  // Any state + cap_reset → active
  {
    from: [
      "active",
      "active_low_balance",
      "active_critical_balance",
      "depleted",
    ],
    event: "programmatic_cap_reset",
    to: "active",
  },

  // cap_reached → depleted from any active state
  {
    from: ["active", "active_low_balance", "active_critical_balance"],
    event: "programmatic_cap_reached",
    to: "depleted",
  },
  {
    from: "depleted",
    event: "programmatic_cap_reached",
    to: "depleted",
  },

  // low_balance: critical < low < no-op (first match wins)
  {
    from: ["active", "active_low_balance"],
    event: "programmatic_low_balance",
    guard: remainingAtMost(CRITICAL_BALANCE_OFFSET),
    to: "active_critical_balance",
  },

  // active -> ...
  {
    from: "active",
    event: "programmatic_low_balance",
    to: "active_low_balance",
  },

  // active_low_balance -> ...
  {
    from: "active_low_balance",
    event: "programmatic_low_balance",
    to: "active_low_balance",
  },

  // active_critical_balance -> ...
  {
    from: "active_critical_balance",
    event: "programmatic_low_balance",
    to: "active_critical_balance",
  },
];

function findTransition(
  current: WorkspaceProgrammaticCreditState,
  event: ProgrammaticCreditEvent
): ProgrammaticCreditTransition | undefined {
  return TRANSITIONS.find((t) => {
    const fromMatch = Array.isArray(t.from)
      ? t.from.includes(current)
      : t.from === current;
    return fromMatch && t.event === event.type && (!t.guard || t.guard(event));
  });
}

export async function transitionProgrammaticCreditState(
  workspace: WorkspaceResource,
  event: ProgrammaticCreditEvent,
  { transaction }: { transaction?: Transaction } = {}
): Promise<Result<WorkspaceProgrammaticCreditState, Error>> {
  const workspaceId = workspace.sId;
  const currentState = workspace.programmaticCreditState;
  const match = findTransition(currentState, event);

  if (!match) {
    logger.warn(
      {
        workspaceId,
        currentState,
        event,
      },
      "[ProgrammaticCreditStateMachine] No matching transition: skipping"
    );
    return new Err(
      new Error(
        `[ProgrammaticCreditStateMachine] Illegal transition: ${currentState} + ${event.type}`
      )
    );
  }

  if (currentState !== match.to) {
    await workspace.updateProgrammaticCreditState(match.to, transaction);
  }
  syncProgrammaticCacheForState(match.to, workspaceId, transaction);
  logger.info(
    {
      workspaceId,
      fromState: currentState,
      toState: match.to,
      eventType: event.type,
      wasStateChanged: currentState !== match.to,
    },
    "[ProgrammaticCreditStateMachine] Transition applied"
  );

  return new Ok(match.to);
}
