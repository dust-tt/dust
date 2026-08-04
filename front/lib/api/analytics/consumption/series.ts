/**
 * Shape of the consumption timeseries, shared by the endpoint that produces it
 * and the chart that renders it.
 *
 * Deliberately dependency-free. The chart needs `TOTAL_GROUP_KEY` as a value,
 * and importing a value from `timeseries.ts` would pull its transitive
 * `@app/lib/api/elasticsearch` import — and with it the Elasticsearch client and
 * its Node built-ins — into the browser bundle, which fails to load. Types can
 * cross that boundary freely because `import type` is erased; values cannot.
 */

export type ConsumptionGranularity = "day" | "week" | "month";
export type ConsumptionTimeseriesMode = "daily" | "cumulative";

// Single series carrying everything, when no breakdown is asked for.
export const TOTAL_GROUP_KEY = "total";

// Consumption outside the top N of a breakdown, folded into one series so the
// stacked series still add up to the period's total.
export const OTHERS_GROUP_KEY = "others";

// Dimensions the series can be split by. Only `agent` so far — each dimension
// needs its ids resolved to display names, and the other resolvers arrive with
// the attribution work. Adding to this list stays backward compatible.
export const CONSUMPTION_BREAKDOWN_DIMENSIONS = ["agent"] as const;

export type ConsumptionBreakdownDimension =
  (typeof CONSUMPTION_BREAKDOWN_DIMENSIONS)[number];

export const DEFAULT_CONSUMPTION_BREAKDOWN_COUNT = 10;

export type ConsumptionTimeseriesGroup = {
  groupKey: string;
  name: string;
};

export type ConsumptionTimeseriesPoint = {
  timestamp: number;
  values: Record<string, number>;
  isPartial: boolean;
};
