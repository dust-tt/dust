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

// Fraction of the personal seat balance / per-user cap at which the
// low-balance warning bands kick in. Mirrors the seat-low-balance guards in
// `lib/metronome/user_credit_state_machine.ts` (threshold === 0.2 * allowance)
// and `USER_AWU_WARNING_PERCENTAGE` (0.8) backing the per-user warning alerts.
export const SEAT_LOW_BALANCE_FRACTION = 0.2;
export const CAP_WARNING_FRACTION = 0.8;

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
 *     `user_seat` (or `user_seat_low_balance` at ≤20% remaining); once the
 *     personal balance is exhausted — or for pool-based seats that never had
 *     one — they spend from the workspace pool (`on_pool`, or
 *     `on_pool_low_balance` at ≥80% of the cap). Free seats are the exception:
 *     they are seat-based but have no pool fallback, so an exhausted free seat
 *     is `capped`.
 *
 * `seatBalanceAwu` / `seatStartingBalanceAwu` come from the live Metronome
 * per-seat balance (`listMetronomeSeatBalances`); `null` means the user has no
 * individual seat allocation (pool-based seat), so they are treated as
 * spending from the pool. `perUserCapAwuCredits` / `consumedAwuCredits` are
 * `null` when no cap is configured or usage is unknown, in which case the cap
 * bands are skipped.
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

  // Seat-based user (pro/max/free) with a known personal balance.
  if (isSeatBased(seatType) && seatBalanceAwu !== null) {
    if (seatBalanceAwu > 0) {
      // Still spending personal credits.
      if (
        seatStartingBalanceAwu !== null &&
        seatBalanceAwu <= SEAT_LOW_BALANCE_FRACTION * seatStartingBalanceAwu
      ) {
        return "user_seat_low_balance";
      }
      return "user_seat";
    }
    // Personal balance exhausted. Free seats have no pool fallback, so they are
    // capped; pro/max fall through to the workspace-pool bands below.
    if (normalizeToPoolLimitSeatType(seatType) === null) {
      return "capped";
    }
  }

  // Otherwise spending from the workspace pool (pool-based seat, or pro/max
  // whose personal balance is exhausted). Surface the 80% cap warning when
  // applicable.
  if (
    capKnown &&
    consumedAwuCredits >= CAP_WARNING_FRACTION * perUserCapAwuCredits
  ) {
    return "on_pool_low_balance";
  }
  return "on_pool";
}
