import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { consumptionAttributionDimensionLabel } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import type { UsageFilter } from "@app/components/workspace/analytics/usageFilter";
import { describeUsageFilter } from "@app/components/workspace/analytics/usageFilter";
import type {
  ConsumptionGranularity,
  ConsumptionPeriodSelection,
} from "@app/lib/analytics/consumption_period";
import {
  consumptionGranularityLabel,
  consumptionPeriodLabel,
} from "@app/lib/analytics/consumption_period";

export interface AnalyticsViewInput {
  dimension: ConsumptionDimension;
  filter: UsageFilter;
  granularity: ConsumptionGranularity;
  period: ConsumptionPeriodSelection;
}

/**
 * @cc [owner:achilleburah,label:product] describes-what-is-on-screen
 * The returned text MUST describe the view the user is currently looking at, in terms they can
 * recognize: period, granularity and breakdown as their selector labels, and every selected
 * filter by its display name. Where the facets endpoint has no name for an entity it returns the
 * id as the label, so an id MAY appear; the filter MUST still be described rather than dropped,
 * since omitting it misstates the scope the figures cover.
 */
export function describeAnalyticsView({
  dimension,
  filter,
  granularity,
  period,
}: AnalyticsViewInput): string {
  return [
    `Period: ${consumptionPeriodLabel(period)}`,
    `Granularity: ${consumptionGranularityLabel(granularity)}`,
    `Breakdown: ${consumptionAttributionDimensionLabel(dimension)}`,
    `Filters: ${describeUsageFilter(filter)}`,
  ].join("\n");
}
