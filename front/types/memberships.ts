import { assertNever } from "@app/types/shared/utils/assert_never";

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

// Normalized seat types for pool credit limits. Monthly and yearly variants
// share a single pool limit. Free seats are excluded (lifetime allocation,
// no pool access).
export const NORMALIZED_POOL_LIMIT_SEAT_TYPES = [
  "pro",
  "max",
  "workspace",
] as const;

export type NormalizedPoolLimitSeatType =
  (typeof NORMALIZED_POOL_LIMIT_SEAT_TYPES)[number];

export function isNormalizedPoolLimitSeatType(
  value: unknown
): value is NormalizedPoolLimitSeatType {
  return (
    typeof value === "string" &&
    (NORMALIZED_POOL_LIMIT_SEAT_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Map a membership seat type to its normalized pool-limit seat type.
 * Returns null for `free` seats (they have a fixed lifetime allocation with
 * no pool access).
 */
export function normalizeToPoolLimitSeatType(
  seatType: MembershipSeatType | null | undefined
): NormalizedPoolLimitSeatType | null {
  if (!seatType) {
    return null;
  }
  switch (seatType) {
    case "pro":
    case "pro_yearly":
      return "pro";
    case "max":
    case "max_yearly":
      return "max";
    case "workspace":
    case "workspace_yearly":
      return "workspace";
    case "free":
      return null;
    default:
      assertNever(seatType);
  }
}

// Per-user credit state on a membership. Models where a user sits in the
// personal-credits → workspace-pool → cap progression. Only the per-user
// dimension lives here; the workspace-level pool state lives separately on
// `workspaces.poolCreditState` (see WORKSPACE_POOL_CREDIT_STATES in
// `front/types/credits.ts`). A user is allowed to spend iff `creditState !=
// 'capped'` AND the workspace pool is not depleted.
//
// Two customer shapes:
//   - pool-based only: users spend from a shared workspace credits pool (they
//     may be capped). Such users sit in the `on_pool*` states.
//   - seat-based: each user has a personal credit balance they spend first,
//     then fall back to the workspace pool. Such users start in `user_seat*`
//     and move to `on_pool*` once their personal balance is exhausted.
//
//   user_seat:             spending from personal credits.
//   user_seat_low_balance: same, but ≥80% of personal credits already used.
//   on_pool:               personal credits exhausted (or pool-based workspace);
//                          spending from the workspace pool. (Formerly "normal".)
//   on_pool_low_balance:   same, but ≥80% of the per-user cap already used.
//   capped:                per-user spend cap hit; can no longer spend.
//
// MIGRATION (transitional): "normal" is the legacy name for "on_pool" and is
// kept as an accepted alias so the deployed code reads existing rows without
// breaking. It is treated as equivalent to "on_pool" everywhere (see the state
// machine). Remove it once migration 665 has renamed all rows and the
// follow-up PR lands.
export const USER_CREDIT_STATES = [
  "user_seat",
  "user_seat_low_balance",
  "normal",
  "on_pool",
  "on_pool_low_balance",
  "capped",
] as const;

export type UserCreditState = (typeof USER_CREDIT_STATES)[number];

export function isUserCreditState(value: unknown): value is UserCreditState {
  return (
    typeof value === "string" &&
    USER_CREDIT_STATES.includes(value as UserCreditState)
  );
}
