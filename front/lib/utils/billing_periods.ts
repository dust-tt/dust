import { addMonths, getDate, setDate } from "date-fns";

export function getNextBillingPeriodEnd(
  currentDate: Date,
  billingDay: number
): Date {
  // If we've passed the billing day this month, use next month's billing day.
  if (getDate(currentDate) >= billingDay) {
    // Use next month's billing day
    const nextMonth = addMonths(currentDate, 1);
    return setDate(nextMonth, billingDay);
  } else {
    // Use current month's billing day
    return setDate(currentDate, billingDay);
  }
}
