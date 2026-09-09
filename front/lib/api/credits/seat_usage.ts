import type { MembershipSeatType } from "@app/types/memberships";

// Pure seat-usage arithmetic shared by the members usage response builders,
// their server-side sort, and the client table so the three never drift apart.

/**
 * @cc [owner:avervaet,label:product] allowance-first-split
 * `consumedFromAllowanceAwuCredits` is `totalConsumedAwuCredits` capped at
 * `allowanceAwuCredits` (floored at 0), and `consumedFromPoolAwuCredits` is the remainder, so the
 * two always sum to `totalConsumedAwuCredits`.
 */
export function splitConsumedAwuCredits({
  totalConsumedAwuCredits,
  allowanceAwuCredits,
}: {
  totalConsumedAwuCredits: number;
  allowanceAwuCredits: number;
}): {
  consumedFromAllowanceAwuCredits: number;
  consumedFromPoolAwuCredits: number;
} {
  const consumedFromAllowanceAwuCredits = Math.min(
    totalConsumedAwuCredits,
    Math.max(0, allowanceAwuCredits)
  );
  return {
    consumedFromAllowanceAwuCredits,
    consumedFromPoolAwuCredits:
      totalConsumedAwuCredits - consumedFromAllowanceAwuCredits,
  };
}

/**
 * @cc [owner:avervaet,label:product] free-seat-balance-fallback
 * For a `free` seat, `consumed` is `memberUsageLimit - seatBalanceAwu` (floored at 0) only when
 * both are numbers; when either is `null` (balance unknown) it falls back to
 * `consumedFromAllowanceAwuCredits` and must never be treated as fully consumed.
 */
/**
 * @cc [owner:avervaet,label:product] has-percent-requires-allowance
 * `hasPercent` is true iff `seatType` is non-null and `memberUsageLimit` is a positive number;
 * when false, `percent` is not comparable to other rows and callers must not rank on it.
 */
export function computeSeatUsage({
  seatType,
  memberUsageLimit,
  seatBalanceAwu,
  consumedFromAllowanceAwuCredits,
}: {
  seatType: MembershipSeatType | null;
  memberUsageLimit: number | null;
  seatBalanceAwu: number | null;
  consumedFromAllowanceAwuCredits: number;
}): {
  percent: number;
  hasPercent: boolean;
  isOverAllowance: boolean;
  consumed: number;
  allowance: number;
} {
  const allowance = memberUsageLimit ?? 0;
  const isFreeWithBalance =
    seatType === "free" &&
    typeof seatBalanceAwu === "number" &&
    typeof memberUsageLimit === "number";
  const consumed = isFreeWithBalance
    ? Math.max(0, memberUsageLimit - seatBalanceAwu)
    : consumedFromAllowanceAwuCredits;
  if (allowance <= 0) {
    return {
      percent: consumed > 0 ? 100 : 0,
      hasPercent: false,
      isOverAllowance: consumed > 0,
      consumed,
      allowance,
    };
  }
  return {
    percent: Math.min(100, (consumed / allowance) * 100),
    hasPercent: seatType !== null,
    isOverAllowance: consumed > allowance,
    consumed,
    allowance,
  };
}
