import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/types/api/analytics/consumption";
import { CONSUMPTION_SCOPE_FILTER_KEYS } from "@app/types/api/analytics/consumption";

export const CONSUMPTION_PERIOD_DAY_OPTIONS = [7, 30, 90, 180] as const;

export const DEFAULT_CONSUMPTION_PERIOD_DAYS = 30;

export type ConsumptionPeriodDays =
  (typeof CONSUMPTION_PERIOD_DAY_OPTIONS)[number];

export type ConsumptionPeriodSelection =
  | { kind: "cycle" }
  | { kind: "days"; days: ConsumptionPeriodDays };

export const DEFAULT_CONSUMPTION_PERIOD: ConsumptionPeriodSelection = {
  kind: "cycle",
};

export const CONSUMPTION_PERIOD_OPTIONS: ConsumptionPeriodSelection[] = [
  { kind: "cycle" },
  ...CONSUMPTION_PERIOD_DAY_OPTIONS.map((days) => ({
    kind: "days" as const,
    days,
  })),
];

export const CONSUMPTION_GRANULARITY_OPTIONS = [
  "day",
  "week",
  "month",
] as const;

export type ConsumptionGranularity =
  (typeof CONSUMPTION_GRANULARITY_OPTIONS)[number];

export const DEFAULT_CONSUMPTION_GRANULARITY: ConsumptionGranularity = "day";

const CONSUMPTION_GRANULARITY_LABELS: Record<ConsumptionGranularity, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
};

export function consumptionGranularityFromKey(
  key: string
): ConsumptionGranularity | null {
  return CONSUMPTION_GRANULARITY_OPTIONS.find((o) => o === key) ?? null;
}

export function consumptionGranularityLabel(
  granularity: ConsumptionGranularity
): string {
  return CONSUMPTION_GRANULARITY_LABELS[granularity];
}

export function formatConsumptionDate(date: string | number): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// The counterpart the used share of the cap is read against.
export function cycleElapsedPercent({
  startDate,
  endDate,
}: ConsumptionPeriod): number {
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const elapsedRatio = (Date.now() - startMs) / (endMs - startMs);
  return Math.round(Math.min(Math.max(elapsedRatio, 0), 1) * 100);
}

// The endpoints bucket the whole period, so the tail of a series is the part of
// the cycle still to come. The bucket holding the present is the last one that
// has started, which is all it takes to tell the two apart.
export function findPartialTimestamp(
  points: { timestamp: number }[]
): number | undefined {
  const nowMs = Date.now();
  return points.findLast((point) => point.timestamp <= nowMs)?.timestamp;
}

export function consumptionPeriodLabel(
  selection: ConsumptionPeriodSelection
): string {
  return selection.kind === "cycle"
    ? "This cycle"
    : `Last ${selection.days} days`;
}

export function consumptionPeriodKey(
  selection: ConsumptionPeriodSelection
): string {
  return selection.kind === "cycle" ? "cycle" : `days:${selection.days}`;
}

export function consumptionPeriodFromKey(
  key: string
): ConsumptionPeriodSelection | null {
  return (
    CONSUMPTION_PERIOD_OPTIONS.find(
      (option) => consumptionPeriodKey(option) === key
    ) ?? null
  );
}

// Sorted, empty-dimension-free filter, so the same selection always produces
// the same request body, needed for the SWR cache key to stay stable.
export function normalizedConsumptionFilter(
  filter: ConsumptionScopeFilter | undefined
): ConsumptionScopeFilter | undefined {
  if (!filter) {
    return undefined;
  }

  const normalized: ConsumptionScopeFilter = {};
  for (const key of CONSUMPTION_SCOPE_FILTER_KEYS) {
    const values = filter[key];
    if (values && values.length > 0) {
      normalized[key] = [...values].sort();
    }
  }
  return normalized;
}
