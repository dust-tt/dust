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

// Billable seat types — each maps to a Metronome product. Kept as the single
// source of truth so the full seat-type union and the billable subset can't
// drift apart.
export const BILLABLE_SEAT_TYPES = [
  "free",
  "workspace",
  "workspace_yearly",
  "pro",
  "pro_yearly",
  "max",
  "max_yearly",
] as const;

export const MEMBERSHIP_SEAT_TYPES = [
  // `none` is a special seat type for members who could not be assigned any
  // billable seat (every billable tier was at its configured `max`). Members
  // on `none` consume no billable seat and cannot send messages.
  "none",
  ...BILLABLE_SEAT_TYPES,
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

// A "billable" seat type is any seat type other than `none`. `none` members
// hold no seat and are excluded from Metronome seat billing.
export type BillableSeatType = (typeof BILLABLE_SEAT_TYPES)[number];

export function isBillableSeatType(
  value: MembershipSeatType
): value is BillableSeatType {
  return value !== "none";
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
