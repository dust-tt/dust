import { assertNever } from "@app/types/shared/utils/assert_never";

export const MEMBERSHIP_ROLE_TYPES = [
  "admin",
  "manager",
  "builder",
  "user",
] as const;

export type MembershipRoleType = (typeof MEMBERSHIP_ROLE_TYPES)[number];

export const MEMBERSHIP_ORIGIN_TYPES = [
  "provisioned",
  "invited",
  "auto-joined",
] as const;

export type MembershipOriginType = (typeof MEMBERSHIP_ORIGIN_TYPES)[number];

// Paid seat types — billable seats excluding the one-shot `free` starter seat.
// These are the seats a member can be moved to from the admin seat pickers.
export const PAID_SEAT_TYPES = [
  "workspace",
  "workspace_yearly",
  "pro",
  "pro_yearly",
  "max",
  "max_yearly",
] as const;

export type PaidSeatType = (typeof PAID_SEAT_TYPES)[number];

// Billable seat types — each maps to a Metronome product.
export const BILLABLE_SEAT_TYPES = ["free", ...PAID_SEAT_TYPES] as const;

export const MEMBERSHIP_SEAT_TYPES = [
  // `none` = no billable seat assigned; member cannot send messages.
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

// Relative tier ordering of seat types, from lowest to highest. Yearly variants
// share their base tier. Used both to sort seat plans for display and to tell
// whether a scheduled seat change is an upgrade or a downgrade. `none` is the
// lowest (no seat) and `workspace` the highest (platform/enterprise seat).
export const SEAT_TYPE_ORDER: Record<MembershipSeatType, number> = {
  none: 0,
  free: 1,
  pro: 2,
  pro_yearly: 2,
  max: 3,
  max_yearly: 3,
  workspace: 4,
  workspace_yearly: 4,
};

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
 * Collapse a seat type's `_yearly` variant onto its base tier (e.g.
 * `pro_yearly` → `pro`). Yearly and monthly variants share a tier, icon and
 * label, so this is used both for display and for matching a base seat-type
 * filter against either cadence.
 */
export function toBaseSeatType(
  seatType: MembershipSeatType
): MembershipSeatType {
  if (seatType.endsWith("_yearly")) {
    const base = seatType.slice(0, -"_yearly".length);
    if (isMembershipSeatType(base)) {
      return base;
    }
  }
  return seatType;
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
    case "none":
      return null;
    default:
      assertNever(seatType);
  }
}

/**
 * Whether a seat type carries an individual (per-user) credit allocation the
 * user spends from before falling back to the workspace pool. Pro and max seats
 * do; free seats also have a personal allocation (a fixed lifetime grant) — the
 * only difference is free seats have no pool fallback, so they stay `user_seat`
 * once exhausted (their blocking is the rate-limiter lifetime cap). Workspace
 * seats have no individual allocation (they spend straight from the shared pool).
 */
export function isSeatBased(
  seatType: MembershipSeatType | null | undefined
): boolean {
  if (!seatType) {
    return false;
  }
  switch (seatType) {
    case "free":
    case "pro":
    case "pro_yearly":
    case "max":
    case "max_yearly":
      return true;
    case "none":
    case "workspace":
    case "workspace_yearly":
      return false;
    default:
      return assertNever(seatType);
  }
}

/**
 * Whether a seat type carries an individual per-seat Metronome subscription
 * balance — queryable via `listMetronomeSeatBalances`'s `seatIds` filter.
 * Pro/max only: free seats hold a per-user *customer* credit instead (a
 * different Metronome object, see `listCustomerPerUserCreditBalances`), and
 * workspace/none seats have no individual balance at all.
 */
export function hasMetronomeSeatBalance(
  seatType: MembershipSeatType | null | undefined
): boolean {
  if (!seatType) {
    return false;
  }
  switch (seatType) {
    case "pro":
    case "pro_yearly":
    case "max":
    case "max_yearly":
      return true;
    case "free":
    case "none":
    case "workspace":
    case "workspace_yearly":
      return false;
    default:
      return assertNever(seatType);
  }
}

export function isPaidSeatType(
  seatType: MembershipSeatType
): seatType is PaidSeatType {
  switch (seatType) {
    case "workspace":
    case "workspace_yearly":
    case "pro":
    case "pro_yearly":
    case "max":
    case "max_yearly":
      return true;
    case "none":
    case "free":
      return false;
    default:
      return assertNever(seatType);
  }
}

// Per-user credit state on a membership — the seat↔pool dimension only: whether
// the user is currently spending from their personal seat balance or from the
// shared workspace pool. The workspace-level pool state lives separately on
// `workspaces.poolCreditState`. Spend caps (per-user, per-key, programmatic) are
// enforced by the Redis rate limiter, not by this state.
//
//   user_seat: spending from personal credits (seat-based seats, incl. free
//              seats which never draw from a pool).
//   on_pool:   personal credits exhausted (or pool-based workspace); spending
//              from the workspace pool.
//
// MIGRATION (transitional): rows may still hold the legacy values `normal`,
// `on_pool_low_balance`, `user_seat_low_balance`, `capped` until the follow-up
// backfill migration lands. Read paths normalize them via
// `normalizeUserCreditState` (user_seat* → user_seat, everything else →
// on_pool).
export const USER_CREDIT_STATES = ["user_seat", "on_pool"] as const;

export type UserCreditState = (typeof USER_CREDIT_STATES)[number];

export function isUserCreditState(value: unknown): value is UserCreditState {
  return (
    typeof value === "string" &&
    USER_CREDIT_STATES.includes(value as UserCreditState)
  );
}

/**
 * Normalize a persisted credit-state string (which may still be a legacy value
 * during the migration window) to the narrowed `user_seat` / `on_pool` set:
 * `user_seat*` → `user_seat`, everything else (`on_pool*`, `normal`, `capped`)
 * → `on_pool`. Use at every read boundary until the backfill migration lands.
 */
export function normalizeUserCreditState(raw: string): UserCreditState {
  return raw === "user_seat" || raw === "user_seat_low_balance"
    ? "user_seat"
    : "on_pool";
}

/**
 * Whether a user in the given credit state is currently spending from their
 * personal seat balance (`user_seat`) rather than the shared workspace pool.
 * Such users still have their own credits and are therefore unaffected by
 * workspace pool depletion.
 */
export function isSpendingFromPersonalSeat(state: UserCreditState): boolean {
  switch (state) {
    case "user_seat":
      return true;
    case "on_pool":
      return false;
    default:
      return assertNever(state);
  }
}

export const MEMBERSHIP_UPGRADE_REQUEST_PENDING_STATUS = "pending";
export const MEMBERSHIP_UPGRADE_REQUEST_STATUSES = [
  MEMBERSHIP_UPGRADE_REQUEST_PENDING_STATUS,
  "approved",
  "denied",
] as const;

export type MembershipUpgradeRequestStatus =
  (typeof MEMBERSHIP_UPGRADE_REQUEST_STATUSES)[number];

export const MAX_UPGRADE_REQUEST_REASON_LENGTH_CHARS = 1024;

export interface MembershipUpgradeRequestType {
  sId: string;
  status: MembershipUpgradeRequestStatus;
  createdAt: number;
  resolvedAt: number | null;
  reason: string | null;
  requester: {
    sId: string;
    name: string;
    email: string | null;
    image: string | null;
    seatType: MembershipSeatType | null;
  };
}

/**
 * The credit state a freshly-allocated seat should start in, derived purely
 * from the seat type (assumes a full, unspent balance):
 *   - seat-based (pro/max/free): `user_seat` — they spend personal credits first.
 *   - workspace (pool-based): `on_pool` — no personal allocation, straight to
 *     the shared pool.
 *
 * Used to initialize the state at membership creation; the authoritative
 * reconcile from live Metronome balances refines it afterwards.
 */
export function initialCreditStateForSeatType(
  seatType: MembershipSeatType | null | undefined
): UserCreditState {
  return isSeatBased(seatType) ? "user_seat" : "on_pool";
}

/**
 * Compute the seat↔pool credit state a user *should* be in from the live source
 * of truth: a seat-based user still holding personal credit is `user_seat`; once
 * that personal balance is exhausted — or for pool-based seats that never had
 * one — they spend from the workspace pool (`on_pool`). Free seats have no pool
 * fallback, so they stay `user_seat` regardless of balance (their blocking is
 * the rate-limiter lifetime cap, not this state).
 *
 * `seatBalanceAwu > 0` means the user still holds personal credit; a `null`
 * (unknown) balance never downgrades a seat user off `user_seat` — only a known
 * 0 does.
 */
export function expectedUserCreditState({
  seatType,
  seatBalanceAwu,
}: {
  seatType: MembershipSeatType | null | undefined;
  seatBalanceAwu: number | null;
}): UserCreditState {
  // Pool-based seats (workspace) and `none` never hold a personal allocation —
  // they always spend from the workspace pool.
  if (!isSeatBased(seatType)) {
    return "on_pool";
  }

  // Free seats have no pool fallback — they stay on their personal seat
  // regardless of balance (their blocking is the rate-limiter lifetime cap).
  if (normalizeToPoolLimitSeatType(seatType) === null) {
    return "user_seat";
  }

  // Pool-backed seats (pro/max) fall back to the pool only once their personal
  // balance is *known* to be exhausted; a null (unknown) balance leaves them on
  // the seat rather than mis-routing them to the pool.
  return seatBalanceAwu === 0 ? "on_pool" : "user_seat";
}
