import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { CONSUMPTION_SCOPE_FILTER_KEYS } from "@app/lib/api/analytics/consumption/scope";

export const CONSUMPTION_PERIOD_DAY_OPTIONS = [7, 30, 90] as const;

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

export function formatConsumptionDate(date: string | number): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
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
