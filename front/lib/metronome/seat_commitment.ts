import { oneYearAfter } from "@app/lib/metronome/constants";

// Prepaid seat-commitment math, shared verbatim by the SwitchContractDialog SPA
// form (which prefills the default commitment price and shows the commitment
// period) and the server (`lib/api/poke/switch_contract.ts`, which sizes the
// contract credit grant) so the two never drift.
//
// A prepaid seat commitment covers a fixed "commitment period": the window the
// committed seats are billed for. It runs from the contract start to its end
// date, or one year when the contract is open-ended.
//
// Metronome prorates each seat subscription charge per hour over its own billing
// period: a yearly seat's charge is prorated over the contract's year, a monthly
// seat's over each calendar month. `commitmentAmount` reproduces that exactly.
// The credit grant is sized to the same prorated total (so it fully covers the
// charges), and the invoice defaults to it too — the operator may then invoice
// less (a discount), never more than needed to cover the grant.
//
// `ratePerPeriod` is the seat's native billing-period rate (the monthly rate for
// a monthly seat, the yearly rate for a yearly seat), in any consistent unit;
// each helper returns a value in that same unit, so callers may pass either
// major currency units (the form) or Metronome fiat units (the server).

const HOUR_MS = 60 * 60 * 1000;

// Add `months` calendar months in UTC, clamping the day to the last day of the
// target month to avoid overflow (Jan 31 + 1 month lands on Feb 28/29, not Mar
// 3), matching Metronome's contract-start-anchored period math.
function addMonthsUtc(date: Date, months: number): Date {
  const targetMonthIndex = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
}

/**
 * @cc [owner:tdraier,label:product] commitment-period-end
 * The commitment period ends at `endingAt` when set, otherwise exactly one year
 * after `start`.
 */
export function commitmentPeriodEnd(
  start: Date,
  endingAt: Date | undefined
): Date {
  return endingAt ?? oneYearAfter(start);
}

// Fractional number of calendar months in [start, end) — the prorated invoice
// basis. Whole-month and whole-year spans come out exact (a one-year contract is
// exactly 12 months, not ~11.99), with any partial trailing month measured as a
// fraction of that calendar month's length.
export function commitmentMonths(start: Date, end: Date): number {
  if (end.getTime() <= start.getTime()) {
    return 0;
  }
  let wholeMonths = 0;
  while (addMonthsUtc(start, wholeMonths + 1).getTime() <= end.getTime()) {
    wholeMonths++;
  }
  const lastWholeMs = addMonthsUtc(start, wholeMonths).getTime();
  const nextWholeMs = addMonthsUtc(start, wholeMonths + 1).getTime();
  const fraction = (end.getTime() - lastWholeMs) / (nextWholeMs - lastWholeMs);
  return wholeMonths + fraction;
}

// Number of months in one period of each invoice payment frequency.
export const PAYMENT_FREQUENCY_MONTHS: Record<
  "monthly" | "quarterly" | "semi_annually" | "annually",
  number
> = {
  monthly: 1,
  quarterly: 3,
  semi_annually: 6,
  annually: 12,
};

// Count of period starts (start, start + periodMonths, ...) strictly before end.
// Always at least 1.
function periodsWithin(start: Date, end: Date, periodMonths: number): number {
  let count = 0;
  // Bounded well above any realistic commitment (100 years of monthly periods).
  for (let k = 0; k < 1200; k++) {
    if (addMonthsUtc(start, k * periodMonths).getTime() < end.getTime()) {
      count++;
    } else {
      break;
    }
  }
  return Math.max(1, count);
}

/**
 * @cc [owner:tdraier,label:product] invoice-periods-bounded-by-commitment
 * The maximum number of invoice installments of `frequency` is the count of its
 * period starts that fall within the commitment period `[start, end)` (at least
 * 1), so no installment is ever scheduled at or past the contract end.
 */
export function maxInvoicePeriods(
  start: Date,
  end: Date,
  frequency: "monthly" | "quarterly" | "semi_annually" | "annually"
): number {
  return periodsWithin(start, end, PAYMENT_FREQUENCY_MONTHS[frequency]);
}

/**
 * @cc [owner:tdraier,label:product] invoice-period-weights-full-then-remainder
 * Returns one weight per installment (`periods` of `frequency`): the fraction of
 * each period's whole hours that fall within `[start, end)`. Whole periods weigh
 * 1 and only a partial trailing period weighs less, so distributing an amount by
 * these weights bills a full period each installment and the remainder on the
 * last.
 */
export function invoicePeriodWeights(
  start: Date,
  end: Date,
  frequency: "monthly" | "quarterly" | "semi_annually" | "annually",
  periods: number
): number[] {
  const periodMonths = PAYMENT_FREQUENCY_MONTHS[frequency];
  const weights: number[] = [];
  for (let i = 0; i < periods; i++) {
    const periodStart = addMonthsUtc(start, i * periodMonths);
    const periodEnd = addMonthsUtc(start, (i + 1) * periodMonths);
    const overlapEndMs = Math.min(periodEnd.getTime(), end.getTime());
    const periodHours = Math.round(
      (periodEnd.getTime() - periodStart.getTime()) / HOUR_MS
    );
    const overlapHours = Math.max(
      0,
      Math.round((overlapEndMs - periodStart.getTime()) / HOUR_MS)
    );
    weights.push(overlapHours / periodHours);
  }
  return weights;
}

/**
 * @cc [owner:tdraier,label:product] commitment-amount-hourly-prorated
 * The commitment amount equals `minSeats` times, for each seat billing period
 * (one year for a yearly seat, one calendar month for a monthly seat) that
 * starts within `[start, end)`, `ratePerPeriod` scaled by the fraction of that
 * period's whole hours that fall before `end` — reproducing Metronome's
 * per-hour subscription proration. It sizes the credit grant and is the default
 * invoice amount.
 */
export function commitmentAmount({
  minSeats,
  ratePerPeriod,
  isAnnual,
  start,
  end,
}: {
  minSeats: number;
  ratePerPeriod: number;
  isAnnual: boolean;
  start: Date;
  end: Date;
}): number {
  const periodMonths = isAnnual ? 12 : 1;
  let total = 0;
  // Bounded well above any realistic commitment (100 years of monthly periods).
  for (let k = 0; k < 1200; k++) {
    const periodStart = addMonthsUtc(start, k * periodMonths);
    if (periodStart.getTime() >= end.getTime()) {
      break;
    }
    const periodEnd = addMonthsUtc(start, (k + 1) * periodMonths);
    const overlapEndMs = Math.min(periodEnd.getTime(), end.getTime());
    const periodHours = Math.round(
      (periodEnd.getTime() - periodStart.getTime()) / HOUR_MS
    );
    const overlapHours = Math.round(
      (overlapEndMs - periodStart.getTime()) / HOUR_MS
    );
    total += ratePerPeriod * (overlapHours / periodHours);
  }
  return minSeats * total;
}
