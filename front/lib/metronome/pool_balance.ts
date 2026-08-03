import { getNetBalance } from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import type { Result } from "@app/types/shared/result";

/**
 * Sum the live Metronome AWU balance across all AWU credit-type schedules for
 * a customer. This is the same balance the pool credit state machine reacts
 * to via `syncPoolCreditStateFromBalance`; exposed so debug tooling can read
 * it without re-implementing the reduction.
 */
export async function getWorkspacePoolAwuBalance(
  metronomeCustomerId: string
): Promise<Result<number, Error>> {
  return getNetBalance(metronomeCustomerId, {
    creditTypeId: getCreditTypeAwuId(),
  });
}
