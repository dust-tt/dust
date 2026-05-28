import type { EditedByUser } from "@app/types/user";

// Workspace-level pool credit state for the Enterprise Pooled plan. Persisted
// on `workspaces.poolCreditState`, driven by the workspace credit state
// machine in `front/lib/metronome/workspace_credit_state_machine.ts`;
//
//   active:                pool has remaining commit balance
//   active_low_balance:  pool has ≤100 credits remaining (low balance warning)
//   active_critical_balance:   pool has ≤10 credits remaining (critical low balance)
//   overage:               pool exhausted, workspace is in PAYG mode
//   depleted:              pool exhausted and PAYG unavailable (or PAYG cap reached);
//                          all users in the workspace blocked until next billing period
//                          or admin pool top-up.
export const WORKSPACE_POOL_CREDIT_STATES = [
  "active",
  "active_low_balance",
  "active_critical_balance",
  "overage",
  "depleted",
] as const;

export type WorkspacePoolCreditState =
  (typeof WORKSPACE_POOL_CREDIT_STATES)[number];

export function isWorkspacePoolCreditState(
  value: unknown
): value is WorkspacePoolCreditState {
  return (
    typeof value === "string" &&
    WORKSPACE_POOL_CREDIT_STATES.includes(value as WorkspacePoolCreditState)
  );
}

// Workspace-level programmatic credit state. Persisted on
// `workspaces.programmaticCreditState`, driven by the programmatic credit
// state machine in `front/lib/metronome/programmatic_credit_state_machine.ts`.
//
//   active:                  monthly cap has ample headroom
//   active_low_balance:      ≤100 credits remaining before cap
//   active_critical_balance: ≤10 credits remaining before cap
//   depleted:                monthly cap reached; programmatic API calls blocked
export const WORKSPACE_PROGRAMMATIC_CREDIT_STATES = [
  "active",
  "active_low_balance",
  "active_critical_balance",
  "depleted",
] as const;

export type WorkspaceProgrammaticCreditState =
  (typeof WORKSPACE_PROGRAMMATIC_CREDIT_STATES)[number];

export function isWorkspaceProgrammaticCreditState(
  value: unknown
): value is WorkspaceProgrammaticCreditState {
  return (
    typeof value === "string" &&
    WORKSPACE_PROGRAMMATIC_CREDIT_STATES.includes(
      value as WorkspaceProgrammaticCreditState
    )
  );
}

export const CREDIT_TYPES = ["free", "payg", "committed", "excess"] as const;

export type CreditType = (typeof CREDIT_TYPES)[number];

// Consumption priority: free credits first, then committed, then pay-as-you-go.
// Excess credits are never active and should not be consumed.
export const CREDIT_TYPE_SORT_ORDER: Record<CreditType, number> = {
  free: 1,
  committed: 2,
  payg: 3,
  excess: 4,
};

export function isCreditType(value: unknown): value is CreditType {
  return CREDIT_TYPES.includes(value as CreditType);
}

// Credit expiration duration in days (default: 1 year)
export const CREDIT_EXPIRATION_DAYS = 365;

export const MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS = 1000;
export const MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS = 1_000_000;

export type CreditDisplayData = {
  sId: string;
  type: CreditType;
  initialAmountMicroUsd: number;
  remainingAmountMicroUsd: number;
  consumedAmountMicroUsd: number;
  startDate: number | null;
  expirationDate: number | null;
  boughtByUser: EditedByUser | null;
};

export type PendingCreditData = {
  sId: string;
  type: CreditType;
  initialAmountMicroUsd: number;
  paymentUrl: string | null;
  createdAt: number;
};

export type GetCreditsResponseBody = {
  credits: CreditDisplayData[];
  pendingCredits?: PendingCreditData[];
};
