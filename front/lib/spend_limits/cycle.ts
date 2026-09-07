import { makeSpendLimitCycleWindowBounds } from "@app/lib/api/assistant/rate_limits";
import type { Authenticator } from "@app/lib/auth";
import type { BillingCycle } from "@app/lib/client/subscription";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import type { FixedWindowBounds } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { isCreditPricedPlan } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * The UTC calendar month containing `now`, used as the per-user spend-cap cycle
 * for workspaces that are not on a credit-priced plan: they have no Metronome
 * contract, so there is no invoiced billing period to anchor the cycle on.
 *
 * `cycleEnd` is the first instant of the next month (exclusive), matching the
 * Metronome billing periods this stands in for.
 */
export function currentCalendarMonthCycleUtc(
  now: Date = new Date()
): BillingCycle {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  return {
    cycleStart: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
    cycleEnd: new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0)),
  };
}

/**
 * The "cycle" the free-seat lifetime spend limiter sums over: from well before
 * any Dust usage existed to the far future. It anchors the ES seed window for
 * the lifetime counter — combined with the `is_free_seat` filter it yields a
 * seat's all-time consumption. Not a real billing cycle; a fixed, never-rolling
 * window that pairs with `makeSpendLimitLifetimeWindowBounds`.
 */
export function lifetimeSpendCycleUtc(): BillingCycle {
  return {
    cycleStart: new Date(Date.UTC(2020, 0, 1, 0, 0, 0, 0)),
    cycleEnd: new Date(Date.UTC(2100, 0, 1, 0, 0, 0, 0)),
  };
}

/**
 * The cycle to force on the per-user spend-cap helpers for this workspace, or
 * `undefined` to let them resolve the Metronome contract billing period as usual.
 *
 * This is the single place that decides which cycle a workspace is bucketed on,
 * so the reader (enforcement), the writer (usage recording) and the resync all
 * land on the same Redis key.
 */
export function spendLimitCycleOverrideForAuth(
  auth: Authenticator
): BillingCycle | undefined {
  const plan = auth.plan();
  if (plan !== null && isCreditPricedPlan(plan)) {
    return undefined;
  }

  return currentCalendarMonthCycleUtc();
}

// Fixed-window bounds for the current Metronome contract billing cycle (the
// window the pool-level spend caps are bucketed on). `null` when no billing
// period can be resolved — callers treat that as a no-op (fail-open, matching
// the rest of the rate-limiter callers). Shared by the per-user, per-API-key,
// programmatic and workspace spend-cap backups.
export async function resolveSpendLimitCycleBounds(
  workspace: LightWorkspaceType
): Promise<FixedWindowBounds | null> {
  const periodResult = await getCachedMetronomeCurrentBillingPeriod(
    workspace.sId
  );
  if (periodResult.isErr() || !periodResult.value) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        err: periodResult.isErr() ? periodResult.error : undefined,
      },
      "[SpendLimitRateCap] Could not resolve contract billing period; skipping fixed-window cap"
    );
    return null;
  }
  const { cycleStart, cycleEnd } = periodResult.value;
  return makeSpendLimitCycleWindowBounds(cycleStart, cycleEnd);
}
