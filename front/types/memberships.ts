import { NEAR_LIMIT_FRACTION } from "@app/lib/metronome/constants";
import { assertNever } from "@app/types/shared/utils/assert_never";

export const MEMBERSHIP_ROLE_TYPES = [
  "admin",
  "business_admin",
  "builder",
  "user",
] as const;

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

// Billable seat types — each maps to a Metronome product.
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
 * only difference is free seats have no pool fallback, so once exhausted they are
 * `capped` rather than `on_pool`. Workspace seats have no individual allocation
 * (they spend straight from the shared pool).
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

/**
 * Whether a user in the given credit state is currently spending from their
 * personal seat balance (`user_seat*`) rather than the shared workspace pool.
 * Such users still have their own credits and are therefore unaffected by
 * workspace pool depletion — only their own per-user cap (`capped`) can block
 * them.
 */
export function isSpendingFromPersonalSeat(state: UserCreditState): boolean {
  switch (state) {
    case "user_seat":
    case "user_seat_low_balance":
      return true;
    case "normal":
    case "on_pool":
    case "on_pool_low_balance":
    case "capped":
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

export interface MembershipUpgradeRequestType {
  sId: string;
  status: MembershipUpgradeRequestStatus;
  createdAt: number;
  resolvedAt: number | null;
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
 * Compute the credit state a user *should* be in from the live source of
 * truth, across both dimensions of `UserCreditState`:
 *   - the cap dimension (`capped`): consumption reached the effective per-user
 *     cap (seat allowance + pool limit). This is the hard block, evaluated
 *     first — if consumption reached the cap, the personal seat is necessarily
 *     exhausted too.
 *   - the seat↔pool dimension: a seat-based user with personal balance left is
 *     `user_seat`; once the personal balance is exhausted — or for pool-based
 *     seats that never had one — they spend from the workspace pool (`on_pool`).
 *     Free seats are the exception: they are seat-based but have no pool
 *     fallback, so an exhausted free seat is `capped`.
 *
 * `seatBalanceAwu` / `seatStartingBalanceAwu` come from the live per-seat /
 * per-user credit balance; `seatBalanceAwu > 0` means the user still holds
 * personal credit. `perUserCapAwuCredits` / `consumedAwuCredits` are `null`
 * when no cap is configured or usage is unknown, in which case the cap bands
 * are skipped.
 *
 * Crucially, where a seat-based user goes once their personal credit is gone is
 * decided by the SEAT TYPE, not by the balance value: a seat with no pool
 * fallback (free) is never `on_pool` — it stays on its seat until the balance
 * is known-exhausted (0), then `capped`. Seats with a pool fallback (pro/max)
 * fall back to the workspace pool. A `null` (unknown) balance never downgrades
 * a free user — only a known 0 does — so a transient read miss can't wrongly
 * cap or pool them; the exhaustion alert is the authoritative capped trigger.
 */
export function expectedUserCreditState({
  seatType,
  seatBalanceAwu,
  seatStartingBalanceAwu,
  perUserCapAwuCredits,
  consumedAwuCredits,
}: {
  seatType: MembershipSeatType | null | undefined;
  seatBalanceAwu: number | null;
  seatStartingBalanceAwu: number | null;
  perUserCapAwuCredits: number | null;
  consumedAwuCredits: number | null;
}): UserCreditState {
  const capKnown = perUserCapAwuCredits !== null && consumedAwuCredits !== null;

  // Hard block first: consumption reached the per-user cap.
  if (capKnown && consumedAwuCredits >= perUserCapAwuCredits) {
    return "capped";
  }

  // Seat-based user still holding personal credit.
  if (isSeatBased(seatType) && seatBalanceAwu !== null && seatBalanceAwu > 0) {
    return "user_seat";
  }

  // Seats with no pool fallback (free) never spend from the pool: they stay on
  // their personal seat until the balance is known-exhausted (0 → capped). An
  // unknown (null) balance leaves them on the seat — never `on_pool`.
  if (
    isSeatBased(seatType) &&
    normalizeToPoolLimitSeatType(seatType) === null
  ) {
    return seatBalanceAwu === 0 ? "capped" : "user_seat";
  }

  // Pool-backed seats (pro/max with depleted balance) and pool-based seats spend
  // from the workspace pool.
  return "on_pool";
}

/**
 * Compute whether a user should see the "near limit" warning banner from their
 * live Metronome inputs. Two sources:
 *   - Cap consumption ≥ 80 % of the effective per-user cap (seat allowance +
 *     pool limit). Applies to pro/max pool users.
 *   - Free seat: ≥ 80 % of the lifetime credit consumed (≤ 20 % remaining).
 */
export function computeUserNearLimit({
  seatType,
  seatBalanceAwu,
  seatStartingBalanceAwu,
  effectiveCapAwuCredits,
  consumedAwuCredits,
}: {
  seatType: MembershipSeatType | null | undefined;
  seatBalanceAwu: number | null;
  seatStartingBalanceAwu: number | null;
  effectiveCapAwuCredits: number | null;
  consumedAwuCredits: number | null;
}): boolean {
  // Cap-based warning (pro/max with a configured cap).
  if (effectiveCapAwuCredits !== null && consumedAwuCredits !== null) {
    return consumedAwuCredits >= NEAR_LIMIT_FRACTION * effectiveCapAwuCredits;
  }
  // Free-seat lifetime credit warning (no pool fallback, no cap).
  if (
    seatType === "free" &&
    seatBalanceAwu !== null &&
    seatStartingBalanceAwu !== null &&
    seatStartingBalanceAwu > 0
  ) {
    return seatBalanceAwu <= (1 - NEAR_LIMIT_FRACTION) * seatStartingBalanceAwu;
  }
  return false;
}
