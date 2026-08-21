export interface BillingCycle {
  cycleStart: Date;
  cycleEnd: Date;
}

/**
 * A calendar day beyond the target month's length overflows into the next
 * month when constructing a Date (e.g. Feb 31 → Mar 3). Bring such dates back
 * to the last day of the expected month (day 0 of the month the date
 * overflowed into).
 *
 * `month` is the expected JS month index and may be outside 0-11 (e.g. built
 * from `referenceMonth + 1`); it is normalized before comparison.
 */
export function clampToMonth(date: Date, month: number, useUTC: boolean): Date {
  const expectedMonth = ((month % 12) + 12) % 12;
  const actualMonth = useUTC ? date.getUTCMonth() : date.getMonth();
  if (actualMonth === expectedMonth) {
    return date;
  }
  // Overflow only shifts days, so the date's time-of-day is the intended
  // boundary time — keep it on the clamped result.
  return useUTC
    ? new Date(
        Date.UTC(
          date.getUTCFullYear(),
          actualMonth,
          0,
          date.getUTCHours(),
          date.getUTCMinutes(),
          date.getUTCSeconds(),
          date.getUTCMilliseconds()
        )
      )
    : new Date(
        date.getFullYear(),
        actualMonth,
        0,
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
        date.getMilliseconds()
      );
}

/**
 * Calculate the billing cycle for a given day of the month.
 * Example: if billing starts on the 4th, the cycle is from the 4th of one month
 * to the 4th of the next month (exclusive).
 *
 * A start day beyond a month's length is clamped to that month's last day
 * (day 31 → Feb 28), matching the usual billing anniversary convention.
 *
 * @param billingCycleStartDay - The day of the month when the billing cycle starts (1-31)
 * @param referenceDate - The date to calculate the cycle for (defaults to now)
 * @param useUTC - Whether to use UTC dates (for backend) or local dates (for frontend display)
 * @param boundaryTimeOfDay - Time-of-day for cycle boundaries. Defaults to
 * midnight; pass the billing anchor (e.g. the Metronome contract start, which
 * is hour-aligned) to keep boundaries on its exact time.
 */
export function getBillingCycleFromDay(
  billingCycleStartDay: number,
  referenceDate: Date = new Date(),
  useUTC: boolean = false,
  boundaryTimeOfDay?: Date
): BillingCycle {
  const year = useUTC
    ? referenceDate.getUTCFullYear()
    : referenceDate.getFullYear();
  const month = useUTC ? referenceDate.getUTCMonth() : referenceDate.getMonth();

  const hours = boundaryTimeOfDay
    ? useUTC
      ? boundaryTimeOfDay.getUTCHours()
      : boundaryTimeOfDay.getHours()
    : 0;
  const minutes = boundaryTimeOfDay
    ? useUTC
      ? boundaryTimeOfDay.getUTCMinutes()
      : boundaryTimeOfDay.getMinutes()
    : 0;
  const seconds = boundaryTimeOfDay
    ? useUTC
      ? boundaryTimeOfDay.getUTCSeconds()
      : boundaryTimeOfDay.getSeconds()
    : 0;
  const milliseconds = boundaryTimeOfDay
    ? useUTC
      ? boundaryTimeOfDay.getUTCMilliseconds()
      : boundaryTimeOfDay.getMilliseconds()
    : 0;

  // The anchor-day boundary in the month `monthOffset` months from the
  // reference month, clamped to that month's last day when the month is
  // shorter than the anchor day.
  const boundary = (monthOffset: number): Date => {
    const candidate = useUTC
      ? new Date(
          Date.UTC(
            year,
            month + monthOffset,
            billingCycleStartDay,
            hours,
            minutes,
            seconds,
            milliseconds
          )
        )
      : new Date(
          year,
          month + monthOffset,
          billingCycleStartDay,
          hours,
          minutes,
          seconds,
          milliseconds
        );
    return clampToMonth(candidate, month + monthOffset, useUTC);
  };

  // The cycle containing the reference date starts on the latest boundary at
  // or before it: this month's boundary once reached, last month's otherwise.
  if (boundary(0).getTime() <= referenceDate.getTime()) {
    return { cycleStart: boundary(0), cycleEnd: boundary(1) };
  }
  return { cycleStart: boundary(-1), cycleEnd: boundary(0) };
}

/**
 * Calculate the current billing cycle based on the subscription start date.
 * Returns null if no subscription start date is provided.
 */
export function getBillingCycle(
  subscriptionStartDate: number | null,
  referenceDate: Date = new Date()
): BillingCycle | null {
  if (!subscriptionStartDate) {
    return null;
  }

  const billingCycleStartDay = new Date(subscriptionStartDate).getUTCDate();
  return getBillingCycleFromDay(billingCycleStartDay, referenceDate, true);
}
