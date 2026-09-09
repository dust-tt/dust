import type { MembershipSeatType } from "@app/types/memberships";

// Pure seat-usage arithmetic. Every place that derives a seat percentage or an
// allowance/pool split must go through here so the numbers never drift apart.

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
 * @cc [owner:avervaet,label:product] percent-requires-seat-and-allowance
 * `percent` is a number in `[0, 100]` iff `seatType` is a real seat (not `null`, not `"none"`) and
 * `memberUsageLimit` is positive; otherwise it is `null` and callers must not rank or render it.
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
  percent: number | null;
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
  const hasSeat = seatType !== null && seatType !== "none";
  return {
    percent:
      hasSeat && allowance > 0
        ? Math.min(100, (consumed / allowance) * 100)
        : null,
    consumed,
    allowance,
  };
}
