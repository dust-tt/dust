// If mention the price of the PRO plan in a few different places in the code base,
// so this is just a way to have that value hardcoded in one place.
// Changing this value only changes the value displayed on the webapp and the website,
// not on the Stripe dashboard.
export const PRO_PLAN_COST_MONTHLY = 29;
export const PRO_PLAN_COST_YEARLY = 27;
export const BUSINESS_PLAN_COST_MONTHLY = 45;

export const getPriceWithCurrency = (price: number): string => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isLikelyInUS = timeZone.startsWith("America");
  return isLikelyInUS ? `$${price}` : `${price}€`;
};

interface BillingCycle {
  cycleStart: Date;
  cycleEnd: Date;
}

/**
 * Calculate the billing cycle for a given day of the month.
 * Example: if billing starts on the 4th, the cycle is from the 4th of one month
 * to the 4th of the next month (exclusive).
 *
 * @param billingCycleStartDay - The day of the month when the billing cycle starts (1-31)
 * @param referenceDate - The date to calculate the cycle for (defaults to now)
 * @param useUTC - Whether to use UTC dates (for backend) or local dates (for frontend display)
 */
export function getBillingCycleFromDay(
  billingCycleStartDay: number,
  referenceDate: Date = new Date(),
  useUTC: boolean = false
): BillingCycle {
  const year = useUTC
    ? referenceDate.getUTCFullYear()
    : referenceDate.getFullYear();
  const month = useUTC ? referenceDate.getUTCMonth() : referenceDate.getMonth();
  const day = useUTC ? referenceDate.getUTCDate() : referenceDate.getDate();

  let cycleStart: Date;
  let cycleEnd: Date;

  if (day >= billingCycleStartDay) {
    // Billing cycle started this month, ends next month
    cycleStart = useUTC
      ? new Date(Date.UTC(year, month, billingCycleStartDay, 0, 0, 0, 0))
      : new Date(year, month, billingCycleStartDay);
    cycleEnd = useUTC
      ? new Date(Date.UTC(year, month + 1, billingCycleStartDay, 0, 0, 0, 0))
      : new Date(year, month + 1, billingCycleStartDay);
  } else {
    // Billing cycle started last month, ends this month
    cycleStart = useUTC
      ? new Date(Date.UTC(year, month - 1, billingCycleStartDay, 0, 0, 0, 0))
      : new Date(year, month - 1, billingCycleStartDay);
    cycleEnd = useUTC
      ? new Date(Date.UTC(year, month, billingCycleStartDay, 0, 0, 0, 0))
      : new Date(year, month, billingCycleStartDay);
  }

  return { cycleStart, cycleEnd };
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

  const billingCycleStartDay = new Date(subscriptionStartDate).getDate();
  return getBillingCycleFromDay(billingCycleStartDay, referenceDate, false);
}

export const getPriceAsString = ({
  currency,
  priceInCents,
  priceInMicroUsd,
}:
  | {
      currency: string;
      priceInCents: number;
      priceInMicroUsd?: undefined;
    }
  | {
      currency: "usd";
      priceInCents?: undefined;
      priceInMicroUsd: number;
    }): string => {
  if (priceInMicroUsd !== undefined) {
    return `$${(priceInMicroUsd / 1_000_000).toFixed(2)}`;
  }

  const price = (priceInCents / 100).toFixed(2);
  switch (currency) {
    case "usd":
      return `$${price}`;
    case "eur":
      return `${price}€`;
    default:
      return `${price}${currency}`;
  }
};
