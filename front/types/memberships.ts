export const MEMBERSHIP_ROLE_TYPES = ["admin", "builder", "user"] as const;

export type MembershipRoleType = (typeof MEMBERSHIP_ROLE_TYPES)[number];

export function isMembershipRoleType(
  value: unknown
): value is MembershipRoleType {
  return MEMBERSHIP_ROLE_TYPES.includes(value as MembershipRoleType);
}

export const MEMBERSHIP_ORIGIN_TYPES = [
  "provisioned",
  "invited",
  "auto-joined",
] as const;

export type MembershipOriginType = (typeof MEMBERSHIP_ORIGIN_TYPES)[number];

export function isMembershipOriginType(
  value: unknown
): value is MembershipOriginType {
  return MEMBERSHIP_ORIGIN_TYPES.includes(value as MembershipOriginType);
}

export const MEMBERSHIP_SEAT_TYPES = ["free", "pro", "max", "pooled"] as const;

export type MembershipSeatType = (typeof MEMBERSHIP_SEAT_TYPES)[number];

export function isMembershipSeatType(
  value: unknown
): value is MembershipSeatType {
  return (
    typeof value === "string" &&
    MEMBERSHIP_SEAT_TYPES.includes(value as MembershipSeatType)
  );
}

// Credit state represents the current billing/credit consumption state of a user
// within a workspace. It is persisted on MembershipModel and driven by the
// UserCreditStateMachine in front/lib/metronome/user_credit_state_machine.ts.
//
// The workspace-level billing environment (plan type, PAYG config, pool balance)
// is derived from SubscriptionResource + Metronome contract at transition time
// and used as guard context — it is NOT encoded in the state itself.
//
// State meanings:
//   free_active   — consuming lifetime free credits (free seat, any plan)
//   bundle_active — consuming individual monthly bundle (pro / max seat)
//   pool_active   — consuming from workspace pool (pooled seat, or pro/max fallback
//                   once individual bundle is exhausted)
//   overage       — PAYG spend in progress (bundle and/or pool exhausted)
//   blocked       — no credits of any kind available; requests are rejected
export const USER_CREDIT_STATES = [
  "free_active",
  "bundle_active",
  "pool_active",
  "overage",
  "blocked",
] as const;

export type UserCreditState = (typeof USER_CREDIT_STATES)[number];

export function isUserCreditState(value: unknown): value is UserCreditState {
  return (
    typeof value === "string" &&
    USER_CREDIT_STATES.includes(value as UserCreditState)
  );
}
