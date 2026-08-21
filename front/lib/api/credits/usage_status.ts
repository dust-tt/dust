import type { BillingCycle } from "@app/lib/plans/billing_cycle";
import type {
  CreditUsageStatus,
  CreditUsageTarget,
} from "@app/types/api/credits/usage_status";

const ON_TARGET_REMAINING_COVERAGE = 0.85;
const ELEVATED_REMAINING_COVERAGE = 0.5;

/**
 * Classifies whether the user's remaining credits can cover the remaining
 * billing cycle:
 *
 *   remaining coverage = remaining credit ratio / remaining cycle ratio
 *
 * - on_target (blue): coverage >= 0.85. The 15% relative tolerance absorbs
 *   normal usage variation and avoids noisy warnings near the boundary. For
 *   example, with 80% of the cycle left, 68% of credits remaining is blue.
 * - elevated (orange): 0.5 <= coverage < 0.85. Usage is meaningfully ahead of
 *   target and deserves attention.
 * - critical (red): coverage < 0.5. The remaining credits cover less than half
 *   of the remaining cycle, so the user is likely to run out well before reset.
 *
 * Exhausted credits are always critical. Once the cycle has ended, any
 * positive remaining balance is on target.
 */
function classifyCreditUsageTarget({
  remainingCreditRatio,
  remainingCycleRatio,
}: {
  remainingCreditRatio: number;
  remainingCycleRatio: number;
}): CreditUsageTarget {
  if (remainingCreditRatio <= 0) {
    return "critical";
  }

  if (remainingCycleRatio <= 0) {
    return "on_target";
  }

  const remainingCoverage = remainingCreditRatio / remainingCycleRatio;
  if (remainingCoverage >= ON_TARGET_REMAINING_COVERAGE) {
    return "on_target";
  }
  if (remainingCoverage >= ELEVATED_REMAINING_COVERAGE) {
    return "elevated";
  }
  return "critical";
}

export function computeCreditUsageStatus({
  consumedAwuCredits,
  limitAwuCredits,
  billingCycle,
  nowMs,
}: {
  consumedAwuCredits: number;
  limitAwuCredits: number;
  billingCycle: BillingCycle;
  nowMs: number;
}): CreditUsageStatus | null {
  const cycleStartMs = billingCycle.cycleStart.getTime();
  const cycleEndMs = billingCycle.cycleEnd.getTime();
  const cycleDurationMs = cycleEndMs - cycleStartMs;

  if (limitAwuCredits <= 0 || cycleDurationMs <= 0) {
    return null;
  }

  const usedRatio = Math.min(
    Math.max(consumedAwuCredits / limitAwuCredits, 0),
    1
  );
  const elapsedRatio = Math.min(
    Math.max((nowMs - cycleStartMs) / cycleDurationMs, 0),
    1
  );
  const remainingCreditRatio = 1 - usedRatio;
  const remainingCycleRatio = 1 - elapsedRatio;

  return {
    usedPercentage: Math.round(usedRatio * 100),
    resetAt: billingCycle.cycleEnd.toISOString(),
    target: classifyCreditUsageTarget({
      remainingCreditRatio,
      remainingCycleRatio,
    }),
  };
}
