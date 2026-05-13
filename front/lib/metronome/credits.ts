import { metronomeAmount } from "@app/lib/metronome/amounts";
import {
  createMetronomeCredit,
  floorToHourISO,
} from "@app/lib/metronome/client";
import {
  CURRENCY_TO_CREDIT_TYPE_ID,
  getProductSeatSubscriptionCreditsId,
} from "@app/lib/metronome/constants";
import logger from "@app/logger/logger";
import type { SupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import { addDays } from "date-fns";

/**
 * Load a first-period credit on a Metronome customer to zero out the first
 * Metronome-generated invoice. The credit is scoped to the specific contract
 * and expires after a few days (Metronome generates the first invoice
 * immediately on contract creation).
 */
export async function loadFirstPeriodCredit({
  metronomeCustomerId,
  amountCents,
  currency,
  uniquenessKey,
  now,
}: {
  metronomeCustomerId: string;
  amountCents: number;
  currency: SupportedCurrency;
  uniquenessKey: string;
  now: Date;
}): Promise<Result<{ id: string } | null, Error>> {
  const creditTypeId = CURRENCY_TO_CREDIT_TYPE_ID[currency];
  if (!creditTypeId) {
    return new Err(
      new Error(`Unsupported currency for first period credit: ${currency}`)
    );
  }

  const amount = metronomeAmount(amountCents, currency);
  const startingAt = floorToHourISO(now);
  // 7-day window gives Metronome time to generate the first invoice while
  // ensuring the credit does not bleed into subsequent billing periods.
  const endingBefore = floorToHourISO(addDays(now, 7));

  const result = await createMetronomeCredit({
    metronomeCustomerId,
    productId: getProductSeatSubscriptionCreditsId(),
    creditTypeId,
    amount,
    startingAt,
    endingBefore,
    name: "First period subscription credit",
    idempotencyKey: `first-period-${uniquenessKey}`,
    priority: 0,
  });

  if (result.isErr()) {
    logger.error(
      { error: result.error, metronomeCustomerId },
      "[Metronome] Failed to load first period credit"
    );
  }

  return result;
}
