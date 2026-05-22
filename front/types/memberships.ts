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

export const MEMBERSHIP_SEAT_TYPES = [
  "free",
  "workspace",
  "workspace_yearly",
  "pro",
  "pro_yearly",
  "max",
  "max_yearly",
] as const;

export type MembershipSeatType = (typeof MEMBERSHIP_SEAT_TYPES)[number];

export function isMembershipSeatType(
  value: unknown
): value is MembershipSeatType {
  return (
    typeof value === "string" &&
    MEMBERSHIP_SEAT_TYPES.includes(value as MembershipSeatType)
  );
}

// Per-user credit state on a membership. Only models the per-user dimension, the
// workspace-level pool state lives separately on `workspaces.poolCreditState`
// (see WORKSPACE_POOL_CREDIT_STATES in `front/types/credits.ts`). A user is
// allowed to spend iff `creditState = 'normal'` AND the workspace pool is not
// depleted.
//
//   normal:  within personal spend limits
//   capped:  admin-set per-user spend cap hit (Enterprise Pooled only today)
export const USER_CREDIT_STATES = ["normal", "capped"] as const;

export type UserCreditState = (typeof USER_CREDIT_STATES)[number];

export function isUserCreditState(value: unknown): value is UserCreditState {
  return (
    typeof value === "string" &&
    USER_CREDIT_STATES.includes(value as UserCreditState)
  );
}
