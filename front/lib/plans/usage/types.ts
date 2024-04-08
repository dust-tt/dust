// This is the key used in Stripe's metadata to indicate that this is a usage-based price.
export const REPORT_USAGE_METADATA_KEY = "REPORT_USAGE";

export class InvalidReportUsageError extends Error {}

export const SUPPORTED_REPORT_USAGE = [
  "MAU_1",
  "MAU_5",
  "MAU_10",
  "PER_SEAT",
] as const;
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

export class InvalidRecurringPriceError extends Error {}
