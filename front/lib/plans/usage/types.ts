import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type Stripe from "stripe";

// This is the key used in Stripe's metadata to indicate that this is a usage-based price.
export const REPORT_USAGE_METADATA_KEY = "REPORT_USAGE";

export class InvalidReportUsageError extends Error {}

export const SUPPORTED_REPORT_USAGE = ["MAU_1", "MAU_5", "MAU_10"] as const;
export type SupportedReportUsage = (typeof SUPPORTED_REPORT_USAGE)[number];

export function isSupportedReportUsage(
  usage: string | undefined
): usage is SupportedReportUsage {
  return SUPPORTED_REPORT_USAGE.includes(usage as SupportedReportUsage);
}

/**
 * Monthly active users logic.
 */

export type MauReportUsageType = `MAU_${number}`;

/**
 * Validates that the subscription has a valid recurring price.
 */

export class InvalidRecurringPriceError extends Error {}

export function validateSubscriptionRecurringPrice(
  stripeSubscriptionItem: Stripe.SubscriptionItem
): Result<undefined, InvalidRecurringPriceError> {
  const { recurring } = stripeSubscriptionItem.price;
  if (!recurring) {
    return new Err(
      new InvalidRecurringPriceError(
        "MAU Usage base price only supports prices with monthly recurring."
      )
    );
  }

  const { interval, interval_count: intervalCount } = recurring;
  if (interval !== "month" || intervalCount !== 1) {
    return new Err(
      new InvalidRecurringPriceError(
        `Expected 1 month recurring, found ${intervalCount} ${interval}(s) instead.`
      )
    );
  }

  return new Ok(undefined);
}
