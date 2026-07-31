import type { Authenticator } from "@app/lib/auth";
import type { BillingCycle } from "@app/lib/client/subscription";
import { isCreditPricedPlan } from "@app/types/plan";

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
