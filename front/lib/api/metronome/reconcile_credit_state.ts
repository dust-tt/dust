import { getWorkspacePoolAwuBalance } from "@app/lib/api/metronome/credit_state_dispatcher";
import type { Authenticator } from "@app/lib/auth";
import { isPAYGEnabled } from "@app/lib/credits/credit_payg";
import { getMetronomeProgrammaticCapAlertStates } from "@app/lib/metronome/alerts/programmatic_cap";
import {
  listContractPerUserCreditBalances,
  listMetronomeSeatBalances,
} from "@app/lib/metronome/client";
import { CONTRACT_CREDIT_TYPE_FREE_SEAT } from "@app/lib/metronome/constants";
import {
  awuSeatBalanceForUser,
  fetchLiveUserCreditInputs,
} from "@app/lib/metronome/live_user_credit_inputs";
import { fetchPerUserAwuUsage } from "@app/lib/metronome/per_user_usage";
import {
  expectedProgrammaticCreditStateFromAlerts,
  setProgrammaticCreditStateReconciled,
} from "@app/lib/metronome/programmatic_credit_state_machine";
import { getSeatAllowancesByNormalizedSeatType } from "@app/lib/metronome/seat_types";
import { setUserNearLimit } from "@app/lib/metronome/user_block";
import { setUserCreditStateReconciled } from "@app/lib/metronome/user_credit_state_machine";
import {
  expectedPoolCreditStateFromBalance,
  setWorkspacePoolCreditStateReconciled,
} from "@app/lib/metronome/workspace_credit_state_machine";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type {
  WorkspacePoolCreditState,
  WorkspaceProgrammaticCreditState,
} from "@app/types/credits";
import type {
  MembershipSeatType,
  NormalizedPoolLimitSeatType,
  UserCreditState,
} from "@app/types/memberships";
import {
  computeUserNearLimit,
  expectedUserCreditState,
  normalizeToPoolLimitSeatType,
} from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

export const RECONCILE_CREDIT_STATE_TARGETS = [
  "pool",
  "programmatic",
  "user",
] as const;

export type ReconcileCreditStateTarget =
  (typeof RECONCILE_CREDIT_STATE_TARGETS)[number];

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
  seatType: MembershipSeatType | null;
  previousState: UserCreditState;
  expectedState: UserCreditState;
  newState: UserCreditState;
  wasInvalid: boolean;
  corrected: boolean;
  executed: boolean;
  // Live Metronome per-seat AWU balance for this user: `seatBalanceAwu` is the
  // amount remaining, `seatStartingBalanceAwu` the full allocation granted for
  // the period (e.g. 8000 for a pro seat). Both null for pool-based seats with
  // no individual allocation. The remaining/starting ratio drives the
  // user_seat ↔ user_seat_low_balance band.
  seatBalanceAwu: number | null;
  seatStartingBalanceAwu: number | null;
  effectiveCapAwuCredits: number | null;
  capSource: "override" | "default" | "none";
  consumedAwuCredits: number | null;
};

export type ReconcileCreditStateReport =
  | PoolReconcileReport
  | ProgrammaticReconcileReport
  | UserReconcileReport;

// Treat the legacy "normal" alias as its canonical "on_pool" value when
// comparing the persisted state with the expected one (see USER_CREDIT_STATES).
function normalizeUserCreditState(state: UserCreditState): UserCreditState {
  return state === "normal" ? "on_pool" : state;
}

/**
 * Debug/reconcile entry point behind the poke "Check & Reconcile Credit State"
 * plugin. For the requested credit state machine — pool, programmatic, or a
 * single user — it recomputes the state the workspace *should* be in from the
 * live source of truth (Metronome balance + PAYG for pool, the programmatic cap
 * alert evaluation states for programmatic, the live per-user seat balance +
 * effective per-user cap vs. usage for user), compares it with the persisted
 * state, and — when `execute` is true — writes the expected state through the
 * matching authoritative reconcile setter.
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
    await setWorkspacePoolCreditStateReconciled(workspace, expectedState, {
      workspaceId: workspace.sId,
      paygEnabled,
    });
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
    await setProgrammaticCreditStateReconciled(workspace, expectedState);
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
  const seatType = membership.seatType;
  const metronomeContractId = auth.subscription()?.metronomeContractId ?? null;

  const creditUsageConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

  const liveResult = await fetchLiveUserCreditInputs({
    workspaceId: workspace.sId,
    userId,
    seatType,
    // Pool-only values persisted in the DB; the live-inputs helper adds the
    // seat allowance back to get the total threshold.
    poolCapOverrideAwuCredits: membership.poolCapOverrideAwuCredits,
    defaultPoolCapAwuCredits:
      creditUsageConfig?.defaultPoolCapAwuCredits ?? null,
    metronomeCustomerId,
    metronomeContractId,
  });
  if (liveResult.isErr()) {
    return liveResult;
  }
  const {
    seatBalanceAwu,
    seatStartingBalanceAwu,
    effectiveCapAwuCredits,
    capSource,
    consumedAwuCredits,
  } = liveResult.value;

  const expectedState = expectedUserCreditState({
    seatType,
    seatBalanceAwu,
    seatStartingBalanceAwu,
    perUserCapAwuCredits: effectiveCapAwuCredits,
    consumedAwuCredits,
  });
  const nearLimit = computeUserNearLimit({
    seatType,
    seatBalanceAwu,
    seatStartingBalanceAwu,
    effectiveCapAwuCredits,
    consumedAwuCredits,
  });
  const wasInvalid = normalizeUserCreditState(previousState) !== expectedState;

  let newState = previousState;
  if (execute) {
    newState = await setUserCreditStateReconciled(membership, expectedState, {
      workspaceId: workspace.sId,
      userId,
      seatType,
    });
    void setUserNearLimit(workspace.sId, userId, nearLimit);
  }

  return new Ok({
    target: "user",
    userId,
    seatType,
    previousState,
    expectedState,
    newState,
    wasInvalid,
    corrected: normalizeUserCreditState(previousState) !== newState,
    executed: execute,
    seatBalanceAwu,
    seatStartingBalanceAwu,
    effectiveCapAwuCredits,
    capSource,
    consumedAwuCredits,
  });
}

/**
 * Reconcile every active seated user's credit state for a workspace from the
 * live Metronome source of truth. Called right after the seat-count sync
 * assigns per-user credits, so freshly-created and just-upgraded users land in
 * the correct seat↔pool state (e.g. a new pro user → `user_seat`) instead of
 * being left at the `on_pool` default until a billing-cycle webhook fires.
 *
 * Fetches the shared inputs once (seat balances, per-user usage, the per-user
 * cap overrides and per-seat-type defaults) to avoid an N+1, then computes and
 * applies the expected state per membership. Never throws — a failure here must
 * not fail the seat sync; it logs and returns.
 */
export async function reconcileWorkspaceUserCreditStates({
  workspace,
  metronomeCustomerId,
  metronomeContractId,
}: {
  workspace: LightWorkspaceType;
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<void> {
  const workspaceId = workspace.sId;

  // These return our `Result` type: handle their errors with early returns
  // rather than throw + catch (ERR1).
  const seatBalancesResult = await listMetronomeSeatBalances({
    metronomeCustomerId,
    metronomeContractId,
  });
  if (seatBalancesResult.isErr()) {
    logger.error(
      { workspaceId, err: seatBalancesResult.error },
      "[ReconcileCreditState] Failed to load seat balances"
    );
    return;
  }
  const seatBalances = seatBalancesResult.value;

  // Free seats hold a per-user contract credit, not a seat balance, so they're
  // absent from `listMetronomeSeatBalances`. Read their balances separately so a
  // free user with credit remaining lands on `user_seat` (not `on_pool`) and is
  // moved to `capped` once exhausted. A read failure leaves the map empty —
  // free users then fall back to the seat-balance path (null) as before.
  const perUserCreditBalancesResult = await listContractPerUserCreditBalances({
    metronomeCustomerId,
    metronomeContractId,
    contractCreditType: CONTRACT_CREDIT_TYPE_FREE_SEAT,
  });
  if (perUserCreditBalancesResult.isErr()) {
    logger.warn(
      { workspaceId, err: perUserCreditBalancesResult.error },
      "[ReconcileCreditState] Failed to load per-user credit balances"
    );
  }
  const perUserCreditBalances = perUserCreditBalancesResult.isOk()
    ? perUserCreditBalancesResult.value
    : new Map<string, { balanceAwu: number; startingBalanceAwu: number }>();

  // The seat-allowance cache (contract) and the DB queries can genuinely
  // throw, so they stay wrapped — the ERR1-authorised case. The per-user
  // overrides come from the memberships and the workspace default from the
  // credit-usage configuration (both pool-only values); the seat allowances
  // are needed to derive the total thresholds.
  let seatAllowances: Partial<Record<NormalizedPoolLimitSeatType, number>>;
  let defaultPoolCapAwuCredits: number | null;
  let memberships: MembershipResource[];
  try {
    seatAllowances = await getSeatAllowancesByNormalizedSeatType(workspaceId);
    const creditUsageConfig =
      await CreditUsageConfigurationResource.fetchByWorkspaceModelId(
        workspace.id
      );
    defaultPoolCapAwuCredits =
      creditUsageConfig?.defaultPoolCapAwuCredits ?? null;
    ({ memberships } = await MembershipResource.getActiveMemberships({
      workspace,
    }));
  } catch (err) {
    logger.error(
      { workspaceId, err: normalizeError(err) },
      "[ReconcileCreditState] Failed to load cap thresholds or memberships"
    );
    return;
  }

  // Per-user usage is scoped to the active members' user ids (an unfiltered
  // query is capped server-side and omits users), so load memberships first.
  const memberUserIds = memberships
    .map((m) => m.user?.sId)
    .filter((sId): sId is string => sId !== undefined);
  const usageResult = await fetchPerUserAwuUsage({
    metronomeCustomerId,
    metronomeContractId,
    userIds: memberUserIds,
  });
  if (usageResult.isErr()) {
    logger.error(
      { workspaceId, err: usageResult.error },
      "[ReconcileCreditState] Failed to load per-user usage"
    );
    return;
  }
  const usageByUser = usageResult.value;

  // One UPDATE per drifting membership. Bounded by the workspace's seat count
  // and gated on the `continue` above, so steady-state writes are ~zero; even
  // the worst case (every seat drifting) is a small, infrequent loop on a
  // rarely-used path. A bulk UPDATE-per-target-state isn't worth the
  // complexity here (the cache sync would still have to run per-membership).
  for (const membership of memberships) {
    const userId = membership.user?.sId;
    if (!userId) {
      continue;
    }
    const seatType = membership.seatType;

    const normalizedSeatType = normalizeToPoolLimitSeatType(seatType);
    const poolCapAwuCredits =
      membership.poolCapOverrideAwuCredits ??
      (normalizedSeatType ? defaultPoolCapAwuCredits : null);
    const effectiveCapAwuCredits =
      poolCapAwuCredits !== null
        ? poolCapAwuCredits +
          (normalizedSeatType ? (seatAllowances[normalizedSeatType] ?? 0) : 0)
        : null;
    // Seat balance comes from `listMetronomeSeatBalances` for pro/max; free
    // seats read their per-user credit balance instead (not a seat balance).
    // Pro/max read their seat balance. `expectedUserCreditState` decides routing
    // from the seat type — a free seat is never `on_pool`, and a null (unknown)
    // balance leaves it on the seat rather than mis-capping it.
    const seat =
      awuSeatBalanceForUser(seatBalances, userId) ??
      perUserCreditBalances.get(userId) ??
      null;
    const seatBalanceAwu = seat?.balanceAwu ?? null;
    const seatStartingBalanceAwu = seat?.startingBalanceAwu ?? null;
    const consumedAwuCredits =
      effectiveCapAwuCredits !== null ? (usageByUser.get(userId) ?? 0) : null;

    const expectedState = expectedUserCreditState({
      seatType,
      seatBalanceAwu,
      seatStartingBalanceAwu,
      perUserCapAwuCredits: effectiveCapAwuCredits,
      consumedAwuCredits,
    });
    const nearLimit = computeUserNearLimit({
      seatType,
      seatBalanceAwu,
      seatStartingBalanceAwu,
      effectiveCapAwuCredits,
      consumedAwuCredits,
    });

    try {
      // Always call setUserCreditStateReconciled even when DB state already
      // matches: it skips the DB write but always refreshes the Redis cache,
      // fixing stale "capped" entries that survive after the DB is corrected.
      await setUserCreditStateReconciled(membership, expectedState, {
        workspaceId,
        userId,
        seatType,
      });
      void setUserNearLimit(workspaceId, userId, nearLimit);
    } catch (err) {
      logger.error(
        { workspaceId, userId, err: normalizeError(err) },
        "[ReconcileCreditState] Failed to reconcile a user's credit state"
      );
    }
  }
}
