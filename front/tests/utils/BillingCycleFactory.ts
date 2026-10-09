import type { BillingCycle } from "@app/lib/plans/billing_cycle";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";

// A billing cycle around the current time: `elapsedDays` before now, `remainingDays` after.
export function makeBillingCycle({
  elapsedDays = 10,
  remainingDays = 20,
}: { elapsedDays?: number; remainingDays?: number } = {}): BillingCycle {
  const nowMs = Date.now();
  return {
    cycleStart: new Date(nowMs - elapsedDays * ONE_DAY_MS),
    cycleEnd: new Date(nowMs + remainingDays * ONE_DAY_MS),
  };
}
