import type { MembershipSeatType } from "@app/types/memberships";
import { isMembershipSeatType, isSeatBased } from "@app/types/memberships";
import { isNumber } from "@app/types/shared/utils/general";

// Pure seat-usage arithmetic. Every place that derives a seat percentage or an
// allowance/pool split must go through here so the numbers never drift apart.

// Credits drain seat-allowance-first, then the workspace pool: the allowance
// share is the total capped at the allowance and the pool share is the rest,
// so the two always sum back to the total.
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

// Free seats hold a lifetime grant, so their consumption is derived from the
// live balance when it is known. An unknown balance falls back to the period
// allowance spend rather than being treated as fully consumed.
//
// `percent` is only defined for seat types that carry a personal allocation
// and only when that allocation is positive; otherwise it is `null` and there
// is nothing to render or rank.
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
  isFreeWithBalance: boolean;
} {
  const allowance = memberUsageLimit ?? 0;
  const isFreeWithBalance =
    seatType === "free" &&
    isNumber(seatBalanceAwu) &&
    isNumber(memberUsageLimit);
  const consumed = isFreeWithBalance
    ? Math.max(0, memberUsageLimit - seatBalanceAwu)
    : consumedFromAllowanceAwuCredits;
  // Reached from client-side rendering with seat types sourced from the API,
  // so a value the client bundle doesn't recognize yet (the server started
  // emitting a new seat type before the client redeployed) must degrade to
  // "no percentage" instead of crashing the render.
  return {
    percent:
      isMembershipSeatType(seatType) && isSeatBased(seatType) && allowance > 0
        ? Math.min(100, (consumed / allowance) * 100)
        : null,
    consumed,
    allowance,
    isFreeWithBalance,
  };
}
