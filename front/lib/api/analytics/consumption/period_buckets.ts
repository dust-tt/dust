import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import moment from "moment-timezone";

// Kept in its own module, deliberately free of any heavy runtime dependency (unlike
// `period.ts`, which pulls in Metronome and, transitively, the Elasticsearch client): this
// is imported as a value from the consumption-export Temporal workflow, and the workflow
// bundler can't handle modules that reach node built-ins like `node:zlib`.

const CONSUMPTION_EXPORT_BUCKET_HOURS = 6;

// Splits a period into fixed-size UTC windows so a raw data export can fetch and process
// each window with its own Temporal activity, rather than one activity paginating over
// the whole period.
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
