// This is the key used in Stripe's metadata to indicate that this is a usage-based price.
export const REPORT_USAGE_METADATA_KEY = "REPORT_USAGE";

export class InvalidReportUsageError extends Error {}

export const SUPPORTED_ENTERPRISE_REPORT_USAGE = [
  "MAU_1",
  "MAU_5",
  "MAU_10",
] as const;
type SupportedEnterpriseReportUsage =
  (typeof SUPPORTED_ENTERPRISE_REPORT_USAGE)[number];

export const SUPPORTED_REPORT_USAGE = [
  ...SUPPORTED_ENTERPRISE_REPORT_USAGE,
  "PER_SEAT",
  "FIXED",
] as const;
export type SupportedReportUsage = (typeof SUPPORTED_REPORT_USAGE)[number];

export function isEnterpriseReportUsage(
  usage: string | undefined
): usage is SupportedEnterpriseReportUsage {
  return SUPPORTED_ENTERPRISE_REPORT_USAGE.includes(
    usage as SupportedEnterpriseReportUsage
  );
}

export function isSupportedReportUsage(
  usage: string | undefined
): usage is SupportedReportUsage {
  return SUPPORTED_REPORT_USAGE.includes(usage as SupportedReportUsage);
}

/**
 * Monthly active users logic.
 */

export type MauReportUsageType = `MAU_${number}`;

export function isMauReportUsage(
  usage: string | undefined
): usage is MauReportUsageType {
  return usage?.startsWith("MAU_") ?? false;
}

export class InvalidRecurringPriceError extends Error {}
