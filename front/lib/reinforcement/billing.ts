import type { Authenticator } from "@app/lib/auth";
import type { BillingCycle } from "@app/lib/client/subscription";
import { getMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import logger from "@app/logger/logger";

function currentCalendarMonth(): BillingCycle {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    cycleStart: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
    cycleEnd: new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0)),
  };
}

/**
 * Return the start and end of the current reinforcement billing period.
 *
 * Uses the Metronome contract's billing period as the source of truth when
 * available. Falls back to the current calendar month otherwise.
 */
export async function getCurrentPeriod(
  auth: Authenticator
): Promise<BillingCycle> {
  const subscription = auth.subscription();
  const workspace = auth.workspace();

  const result = await getMetronomeCurrentBillingPeriod({
    metronomeContractId: subscription?.metronomeContractId ?? null,
    metronomeCustomerId: workspace?.metronomeCustomerId ?? null,
  });

  if (result.isOk() && result.value !== null) {
    return result.value;
  }
  if (result.isErr()) {
    logger.warn("Failed to get billing period from metronome");
  }

  return currentCalendarMonth();
}
