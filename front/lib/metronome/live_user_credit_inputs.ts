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

import { getMetronomeDefaultUserCapAlertForSeatType } from "@app/lib/metronome/alerts/spend_limits";
import { listMetronomeSeatBalances } from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
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
  // Live Metronome per-seat AWU balance for this user: `seatBalanceAwu` is the
  // amount remaining, `seatStartingBalanceAwu` the full allocation granted for
  // the period (e.g. 8000 for a pro seat). Both null for pool-based seats with
  // no individual allocation. The remaining/starting ratio drives the
  // user_seat ↔ user_seat_low_balance band.
  seatBalanceAwu: number | null;
  seatStartingBalanceAwu: number | null;
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
 * membership (`memberships.poolCapOverrideAwuCredits`) — the source of truth
 * for per-user overrides. When set, the seat allowance is added back to get
 * the total cap threshold; the seat-type default alert is only consulted when
 * no override is set.
 *
 * Surfaces Metronome read failures as `Err` so callers can fall back.
 */
export async function fetchLiveUserCreditInputs({
  workspaceId,
  userId,
  seatType,
  poolCapOverrideAwuCredits,
  metronomeCustomerId,
  metronomeContractId,
}: {
  workspaceId: string;
  userId: string;
  seatType: MembershipSeatType | null;
  poolCapOverrideAwuCredits: number | null;
  metronomeCustomerId: string;
  metronomeContractId: string | null;
}): Promise<Result<LiveUserCreditInputs, Error>> {
  // Live per-user seat balance (the seat↔pool dimension's source of truth).
  let seatBalanceAwu: number | null = null;
  let seatStartingBalanceAwu: number | null = null;
  if (metronomeContractId) {
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

  // Resolve the effective per-user cap threshold (in AWU credits, seat
  // allowance included): the user-specific override if present, otherwise the
  // seat-type default. `null` means no cap is configured for this user. The
  // override is the pool-only value persisted on the membership; the seat
  // allowance is added back to get the total threshold.
  let effectiveCapAwuCredits: number | null = null;
  let capSource: LiveUserCreditInputs["capSource"] = "none";

  const normalizedSeatType = normalizeToPoolLimitSeatType(seatType);
  if (poolCapOverrideAwuCredits !== null) {
    let seatAllowance = 0;
    if (normalizedSeatType) {
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
    }
    effectiveCapAwuCredits = poolCapOverrideAwuCredits + seatAllowance;
    capSource = "override";
  } else if (normalizedSeatType) {
    const defaultResult = await getMetronomeDefaultUserCapAlertForSeatType({
      metronomeCustomerId,
      workspaceId,
      seatType: normalizedSeatType,
    });
    if (defaultResult.isErr()) {
      return new Err(
        new Error(
          `Failed to read default per-user cap: ${defaultResult.error.message}`
        )
      );
    }
    if (defaultResult.value) {
      effectiveCapAwuCredits = defaultResult.value.alert.threshold;
      capSource = "default";
    }
  }

  // Consumption is only needed for the cap bands (capped / on_pool_low_balance),
  // which require a configured cap; skip the fetch otherwise.
  let consumedAwuCredits: number | null = null;
  if (effectiveCapAwuCredits !== null && metronomeContractId) {
    const usageResult = await fetchPerUserAwuUsage({
      metronomeCustomerId,
      metronomeContractId,
    });
    if (usageResult.isErr()) {
      return new Err(
        new Error(`Failed to read per-user usage: ${usageResult.error.message}`)
      );
    }
    consumedAwuCredits = usageResult.value.get(userId) ?? 0;
  }

  return new Ok({
    seatBalanceAwu,
    seatStartingBalanceAwu,
    effectiveCapAwuCredits,
    capSource,
    consumedAwuCredits,
  });
}
