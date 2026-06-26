// Fetches the live Metronome inputs that determine a single user's credit
// state (per-seat AWU balance + effective per-user cap + consumed usage). The
// mapping from these inputs to a `UserCreditState` lives in
// `expectedUserCreditState` (called by reconcile and by the state machine's
// `per_user_cap_resolved` resolver) — this module only reads the raw numbers.
//
// Lives in its own module so both the reconcile path
// (`reconcile_credit_state.ts`) and the per-user-cap-resolved dispatch
// (`credit_state_dispatcher.ts`) can reach it without an import cycle — the
// reconcile module imports the dispatcher, so the dispatcher cannot import the
// reconcile module back.

import {
  listCustomerPerUserCreditBalances,
  listMetronomeSeatBalances,
} from "@app/lib/metronome/client";
import {
  CONTRACT_CREDIT_TYPE_FREE_SEAT,
  getCreditTypeAwuId,
} from "@app/lib/metronome/constants";
import { fetchPerUserAwuUsage } from "@app/lib/metronome/per_user_usage";
import { getSeatAllowancesByNormalizedSeatType } from "@app/lib/metronome/seat_types";
import type { MetronomeSeatBalance } from "@app/lib/metronome/types";
import type { MembershipSeatType } from "@app/types/memberships";
import { normalizeToPoolLimitSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// The remaining + full AWU seat balance for a user, read from the live
// per-seat balances. Returns null when the user has no individual AWU seat
// allocation (pool-based seat), so callers treat them as spending from the pool.
export function awuSeatBalanceForUser(
  seatBalances: MetronomeSeatBalance[],
  userId: string
): { balanceAwu: number; startingBalanceAwu: number } | null {
  const awuCreditTypeId = getCreditTypeAwuId();
  const seat = seatBalances.find((b) => b.seat_id === userId);
  const awu = seat?.balances.find((b) => b.credit_type_id === awuCreditTypeId);
  if (!awu) {
    return null;
  }
  return { balanceAwu: awu.balance, startingBalanceAwu: awu.starting_balance };
}

export type LiveUserCreditInputs = {
  // Live Metronome per-seat AWU balance: remaining and full allocation.
  // Both null for pool-based seats with no individual allocation.
  seatBalanceAwu: number | null;
  seatStartingBalanceAwu: number | null;
  // Effective per-user cap = poolCap + seatAllowance. Null for seat types with
  // no pool access (free, none).
  effectiveCapAwuCredits: number | null;
  capSource: "override" | "default" | "none";
  consumedAwuCredits: number | null;
};

/**
 * Read the live source-of-truth inputs for a single user's credit state: the
 * live per-seat AWU balance, the effective per-user cap (user override →
 * seat-type default), and the consumed AWU usage. Callers feed these into
 * `expectedUserCreditState` (directly, or via the state machine context) to
 * derive the actual state — this only reads the numbers.
 *
 * `poolCapOverrideAwuCredits` is the pool-only override persisted on the
 * membership (`memberships.poolCapOverrideAwuCredits`) and
 * `defaultPoolCapAwuCredits` the pool-only workspace default persisted on the
 * credit-usage configuration
 * (`credit_usage_configurations.defaultPoolCapAwuCredits`) — the DB sources of
 * truth for the cap. The override wins; the seat allowance is added back to get
 * the total cap threshold.
 *
 * Surfaces Metronome read failures as `Err` so callers can fall back.
 */
export async function fetchLiveUserCreditInputs({
  workspaceId,
  userId,
  seatType,
  poolCapOverrideAwuCredits,
  defaultPoolCapAwuCredits,
  metronomeCustomerId,
  metronomeContractId,
}: {
  workspaceId: string;
  userId: string;
  seatType: MembershipSeatType | null;
  poolCapOverrideAwuCredits: number | null;
  defaultPoolCapAwuCredits: number;
  metronomeCustomerId: string;
  metronomeContractId: string | null;
}): Promise<Result<LiveUserCreditInputs, Error>> {
  // Live per-user seat balance (the seat↔pool dimension's source of truth).
  // Pro/max read their SEAT_BASED seat balance; free seats hold a per-user
  // contract credit instead (not a seat balance), so read that.
  let seatBalanceAwu: number | null = null;
  let seatStartingBalanceAwu: number | null = null;
  if (seatType === "free") {
    const creditBalancesResult = await listCustomerPerUserCreditBalances({
      metronomeCustomerId,
      contractCreditType: CONTRACT_CREDIT_TYPE_FREE_SEAT,
    });
    if (creditBalancesResult.isErr()) {
      return new Err(
        new Error(
          `Failed to read per-user credit balances: ${creditBalancesResult.error.message}`
        )
      );
    }
    const credit = creditBalancesResult.value.get(userId);
    if (credit) {
      seatBalanceAwu = credit.balanceAwu;
      seatStartingBalanceAwu = credit.startingBalanceAwu;
    }
  } else if (metronomeContractId) {
    const seatBalancesResult = await listMetronomeSeatBalances({
      metronomeCustomerId,
      metronomeContractId,
    });
    if (seatBalancesResult.isErr()) {
      return new Err(
        new Error(
          `Failed to read seat balances: ${seatBalancesResult.error.message}`
        )
      );
    }
    const seat = awuSeatBalanceForUser(seatBalancesResult.value, userId);
    if (seat) {
      seatBalanceAwu = seat.balanceAwu;
      seatStartingBalanceAwu = seat.startingBalanceAwu;
    }
  }

  // Cap + usage only apply to pool-limit seat types (pro/max/workspace).
  // Free and none seats have no pool access — their effective cap is null.
  const normalizedSeatType = normalizeToPoolLimitSeatType(seatType);
  let effectiveCapAwuCredits: number | null = null;
  let capSource: LiveUserCreditInputs["capSource"] = "none";
  let consumedAwuCredits: number | null = null;

  if (normalizedSeatType) {
    const poolCapAwuCredits =
      poolCapOverrideAwuCredits ?? defaultPoolCapAwuCredits;
    capSource = poolCapOverrideAwuCredits !== null ? "override" : "default";

    let seatAllowance = 0;
    try {
      const allowances =
        await getSeatAllowancesByNormalizedSeatType(workspaceId);
      seatAllowance = allowances[normalizedSeatType] ?? 0;
    } catch (err) {
      return new Err(
        new Error(
          `Failed to resolve seat allowance: ${normalizeError(err).message}`
        )
      );
    }
    effectiveCapAwuCredits = poolCapAwuCredits + seatAllowance;

    if (metronomeContractId) {
      const usageResult = await fetchPerUserAwuUsage({
        workspaceId,
        metronomeCustomerId,
        userIds: [userId],
      });
      if (usageResult.isErr()) {
        return new Err(
          new Error(
            `Failed to read per-user usage: ${usageResult.error.message}`
          )
        );
      }
      consumedAwuCredits = usageResult.value.get(userId) ?? 0;
    }
  }

  return new Ok({
    seatBalanceAwu,
    seatStartingBalanceAwu,
    effectiveCapAwuCredits,
    capSource,
    consumedAwuCredits,
  });
}
