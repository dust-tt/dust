import {
  dispatchPerUserCapReached,
  dispatchPerUserCapResolved,
  getWorkspacePoolAwuBalance,
  syncPoolCreditStateFromBalance,
} from "@app/lib/api/metronome/credit_state_dispatcher";
import type { Authenticator } from "@app/lib/auth";
import { isPAYGEnabled } from "@app/lib/credits/credit_payg";
import {
  CRITICAL_BALANCE_OFFSET,
  getMetronomeProgrammaticCapAlertStates,
  LOW_BALANCE_OFFSET,
} from "@app/lib/metronome/alerts/programmatic_cap";
import {
  getMetronomeDefaultUserCapAlertForSeatType,
  getMetronomePerUserCap,
} from "@app/lib/metronome/alerts/spend_limits";
import { fetchPerUserAwuUsage } from "@app/lib/metronome/per_user_usage";
import {
  expectedProgrammaticCreditStateFromAlerts,
  transitionProgrammaticCreditState,
} from "@app/lib/metronome/programmatic_credit_state_machine";
import { expectedPoolCreditStateFromBalance } from "@app/lib/metronome/workspace_credit_state_machine";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type {
  WorkspacePoolCreditState,
  WorkspaceProgrammaticCreditState,
} from "@app/types/credits";
import type { UserCreditState } from "@app/types/memberships";
import { normalizeToPoolLimitSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export const RECONCILE_CREDIT_STATE_TARGETS = [
  "pool",
  "programmatic",
  "user",
] as const;

export type ReconcileCreditStateTarget =
  (typeof RECONCILE_CREDIT_STATE_TARGETS)[number];

type ExpectedUserCapState = "capped" | "uncapped" | "unknown";

type PoolReconcileReport = {
  target: "pool";
  previousState: WorkspacePoolCreditState;
  expectedState: WorkspacePoolCreditState;
  newState: WorkspacePoolCreditState;
  wasInvalid: boolean;
  corrected: boolean;
  executed: boolean;
  balanceAwu: number;
  paygEnabled: boolean;
};

type ProgrammaticReconcileReport = {
  target: "programmatic";
  previousState: WorkspaceProgrammaticCreditState;
  expectedState: WorkspaceProgrammaticCreditState;
  newState: WorkspaceProgrammaticCreditState;
  wasInvalid: boolean;
  corrected: boolean;
  executed: boolean;
  alarms: { cap: boolean; low: boolean; critical: boolean };
};

type UserReconcileReport = {
  target: "user";
  userId: string;
  previousState: UserCreditState;
  newState: UserCreditState;
  expectedCapState: ExpectedUserCapState;
  wasInvalid: boolean;
  corrected: boolean;
  executed: boolean;
  effectiveCapAwuCredits: number | null;
  capSource: "override" | "default" | "none";
  consumedAwuCredits: number | null;
};

export type ReconcileCreditStateReport =
  | PoolReconcileReport
  | ProgrammaticReconcileReport
  | UserReconcileReport;

/**
 * Debug/reconcile entry point behind the poke "Check & Reconcile Credit State"
 * plugin. For the requested credit state machine — pool, programmatic, or a
 * single user — it recomputes the state the workspace *should* be in from the
 * live source of truth (Metronome balance + PAYG for pool, the programmatic cap
 * alert evaluation states for programmatic, the effective per-user cap vs.
 * usage for user), compares it with the persisted state, and — when
 * `execute` is true — reconciles through the same machinery the webhooks use.
 *
 * For `user`, only the capped ↔ uncapped dimension is recomputed (the only
 * events the user machine exposes); the seat/pool/low-balance nuances are left
 * to the webhooks, exactly as in production.
 */
export async function reconcileCreditState({
  auth,
  workspace,
  metronomeCustomerId,
  target,
  userId,
  execute,
}: {
  auth: Authenticator;
  workspace: WorkspaceResource;
  metronomeCustomerId: string;
  target: ReconcileCreditStateTarget;
  userId: string | null;
  execute: boolean;
}): Promise<Result<ReconcileCreditStateReport, Error>> {
  switch (target) {
    case "pool":
      return reconcilePool({ auth, workspace, metronomeCustomerId, execute });
    case "programmatic":
      return reconcileProgrammatic({ workspace, metronomeCustomerId, execute });
    case "user":
      if (!userId) {
        return new Err(
          new Error("A user must be selected to reconcile the per-user state.")
        );
      }
      return reconcileUser({
        auth,
        workspace,
        metronomeCustomerId,
        userId,
        execute,
      });
    default:
      return assertNever(target);
  }
}

async function reconcilePool({
  auth,
  workspace,
  metronomeCustomerId,
  execute,
}: {
  auth: Authenticator;
  workspace: WorkspaceResource;
  metronomeCustomerId: string;
  execute: boolean;
}): Promise<Result<PoolReconcileReport, Error>> {
  const balanceResult = await getWorkspacePoolAwuBalance(metronomeCustomerId);
  if (balanceResult.isErr()) {
    return new Err(
      new Error(
        `Failed to read Metronome AWU balance: ${balanceResult.error.message}`
      )
    );
  }
  const balanceAwu = balanceResult.value;
  const paygEnabled = await isPAYGEnabled(auth);
  const expectedState = expectedPoolCreditStateFromBalance({
    balanceAwu,
    paygEnabled,
  });

  const previousState = workspace.poolCreditState;
  const wasInvalid = previousState !== expectedState;

  let newState = previousState;
  if (execute) {
    await syncPoolCreditStateFromBalance({ workspace, metronomeCustomerId });
    newState = workspace.poolCreditState;
  }

  return new Ok({
    target: "pool",
    previousState,
    expectedState,
    newState,
    wasInvalid,
    corrected: previousState !== newState,
    executed: execute,
    balanceAwu,
    paygEnabled,
  });
}

async function reconcileProgrammatic({
  workspace,
  metronomeCustomerId,
  execute,
}: {
  workspace: WorkspaceResource;
  metronomeCustomerId: string;
  execute: boolean;
}): Promise<Result<ProgrammaticReconcileReport, Error>> {
  const statesResult = await getMetronomeProgrammaticCapAlertStates({
    metronomeCustomerId,
    workspaceId: workspace.sId,
  });
  if (statesResult.isErr()) {
    return new Err(
      new Error(
        `Failed to read programmatic cap alerts: ${statesResult.error.message}`
      )
    );
  }
  const { cap, low, critical } = statesResult.value;
  const alarms = {
    cap: cap?.status === "in_alarm",
    low: low?.status === "in_alarm",
    critical: critical?.status === "in_alarm",
  };
  const expectedState = expectedProgrammaticCreditStateFromAlerts({
    capInAlarm: alarms.cap,
    criticalInAlarm: alarms.critical,
    lowInAlarm: alarms.low,
  });

  const previousState = workspace.programmaticCreditState;
  const wasInvalid = previousState !== expectedState;

  let newState = previousState;
  if (execute) {
    await applyProgrammaticState(workspace, expectedState);
    newState = workspace.programmaticCreditState;
  }

  return new Ok({
    target: "programmatic",
    previousState,
    expectedState,
    newState,
    wasInvalid,
    corrected: previousState !== newState,
    executed: execute,
    alarms,
  });
}

// Drive the programmatic machine to `expected` by dispatching the matching
// event(s). For the low-balance bands we first reset to `active` (a no-op when
// already active) so the `programmatic_low_balance` transition — which is only
// legal from an active state — always lands, then route by `remainingCredits`.
async function applyProgrammaticState(
  workspace: WorkspaceResource,
  expected: WorkspaceProgrammaticCreditState
): Promise<void> {
  switch (expected) {
    case "active":
      await transitionProgrammaticCreditState(workspace, {
        type: "programmatic_cap_reset",
      });
      return;
    case "depleted":
      await transitionProgrammaticCreditState(workspace, {
        type: "programmatic_cap_reached",
      });
      return;
    case "active_low_balance":
      await transitionProgrammaticCreditState(workspace, {
        type: "programmatic_cap_reset",
      });
      await transitionProgrammaticCreditState(workspace, {
        type: "programmatic_low_balance",
        remainingCredits: LOW_BALANCE_OFFSET,
      });
      return;
    case "active_critical_balance":
      await transitionProgrammaticCreditState(workspace, {
        type: "programmatic_cap_reset",
      });
      await transitionProgrammaticCreditState(workspace, {
        type: "programmatic_low_balance",
        remainingCredits: CRITICAL_BALANCE_OFFSET,
      });
      return;
    default:
      assertNever(expected);
  }
}

async function reconcileUser({
  auth,
  workspace,
  metronomeCustomerId,
  userId,
  execute,
}: {
  auth: Authenticator;
  workspace: WorkspaceResource;
  metronomeCustomerId: string;
  userId: string;
  execute: boolean;
}): Promise<Result<UserReconcileReport, Error>> {
  const user = await UserResource.fetchById(userId);
  if (!user) {
    return new Err(new Error(`User not found: userId='${userId}'`));
  }

  const lightWorkspace = renderLightWorkspaceType({ workspace });
  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace: lightWorkspace,
    });
  if (!membership) {
    return new Err(
      new Error(`User '${userId}' has no active membership in this workspace.`)
    );
  }
  const previousState = membership.creditState;

  // Resolve the effective per-user cap threshold (in AWU credits, seat
  // allowance included): the user-specific override if present, otherwise the
  // seat-type default. `null` means no cap is configured for this user.
  let effectiveCapAwuCredits: number | null = null;
  let capSource: "override" | "default" | "none" = "none";

  const overrideResult = await getMetronomePerUserCap({
    metronomeCustomerId,
    workspaceId: workspace.sId,
    userId,
  });
  if (overrideResult.isErr()) {
    return new Err(
      new Error(`Failed to read per-user cap: ${overrideResult.error.message}`)
    );
  }
  if (overrideResult.value) {
    effectiveCapAwuCredits = overrideResult.value.alert.threshold;
    capSource = "override";
  } else {
    const normalizedSeatType = normalizeToPoolLimitSeatType(
      membership.seatType
    );
    if (normalizedSeatType) {
      const defaultResult = await getMetronomeDefaultUserCapAlertForSeatType({
        metronomeCustomerId,
        workspaceId: workspace.sId,
        seatType: normalizedSeatType,
      });
      if (defaultResult.isErr()) {
        return new Err(
          new Error(
            `Failed to read default per-user cap: ${defaultResult.error.message}`
          )
        );
      }
      if (defaultResult.value) {
        effectiveCapAwuCredits = defaultResult.value.alert.threshold;
        capSource = "default";
      }
    }
  }

  // Compare the user's current consumption against the cap. Mirrors the
  // production "local cap state" check used when a spend limit is updated.
  let consumedAwuCredits: number | null = null;
  let expectedCapState: ExpectedUserCapState;
  if (effectiveCapAwuCredits === null) {
    // No cap configured: the user can never be in the capped state.
    expectedCapState = "uncapped";
  } else {
    const metronomeContractId =
      auth.subscription()?.metronomeContractId ?? null;
    if (!metronomeContractId) {
      expectedCapState = "unknown";
    } else {
      const usageResult = await fetchPerUserAwuUsage({
        metronomeCustomerId,
        metronomeContractId,
      });
      if (usageResult.isErr()) {
        return new Err(
          new Error(
            `Failed to read per-user usage: ${usageResult.error.message}`
          )
        );
      }
      consumedAwuCredits = usageResult.value.get(userId) ?? 0;
      expectedCapState =
        consumedAwuCredits >= effectiveCapAwuCredits ? "capped" : "uncapped";
    }
  }

  const wasCapped = previousState === "capped";
  const wasInvalid =
    expectedCapState === "unknown"
      ? false
      : (expectedCapState === "capped") !== wasCapped;

  let newState = previousState;
  if (execute && expectedCapState !== "unknown") {
    const dispatchResult =
      expectedCapState === "capped"
        ? await dispatchPerUserCapReached({ workspace, userId })
        : await dispatchPerUserCapResolved({ workspace, userId });
    if (dispatchResult.isErr()) {
      return new Err(dispatchResult.error);
    }
    // The dispatch mutates a freshly fetched membership, so re-read to report
    // the persisted state.
    const refreshed =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace: lightWorkspace,
      });
    newState = refreshed?.creditState ?? previousState;
  }

  return new Ok({
    target: "user",
    userId,
    previousState,
    newState,
    expectedCapState,
    wasInvalid,
    corrected: previousState !== newState,
    executed: execute,
    effectiveCapAwuCredits,
    capSource,
    consumedAwuCredits,
  });
}
