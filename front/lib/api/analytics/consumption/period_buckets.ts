import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";

const CONSUMPTION_EXPORT_BUCKET_MS = 6 * 60 * 60 * 1000;

export function splitConsumptionPeriodIntoBuckets(
  period: ConsumptionPeriod
): ConsumptionPeriod[] {
  const endMs = new Date(period.endDate).getTime();

  const buckets: ConsumptionPeriod[] = [];
  let bucketStartMs = new Date(period.startDate).getTime();
  while (bucketStartMs < endMs) {
    const bucketEndMs = Math.min(
      bucketStartMs + CONSUMPTION_EXPORT_BUCKET_MS,
      endMs
    );
    buckets.push({
      startDate: new Date(bucketStartMs).toISOString(),
      endDate: new Date(bucketEndMs).toISOString(),
    });
    bucketStartMs = bucketEndMs;
  }

  return buckets;
}
