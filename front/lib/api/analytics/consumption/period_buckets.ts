import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import moment from "moment-timezone";

const CONSUMPTION_EXPORT_BUCKET_HOURS = 6;

export function splitConsumptionPeriodIntoBuckets(
  period: ConsumptionPeriod
): ConsumptionPeriod[] {
  const end = moment.utc(period.endDate);

  const buckets: ConsumptionPeriod[] = [];
  let bucketStart = moment.utc(period.startDate);
  while (bucketStart.isBefore(end)) {
    const bucketEnd = moment.min(
      bucketStart.clone().add(CONSUMPTION_EXPORT_BUCKET_HOURS, "hours"),
      end
    );
    buckets.push({
      startDate: bucketStart.toISOString(),
      endDate: bucketEnd.toISOString(),
    });
    bucketStart = bucketEnd;
  }

  return buckets;
}
