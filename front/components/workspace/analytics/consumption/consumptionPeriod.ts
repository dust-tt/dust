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

/**
 * Periods and chart buckets are both resolved in UTC server-side, so they have
 * to be rendered in UTC too. Formatting a UTC midnight boundary in the viewer's
 * zone shifts the label by a day for anyone west of Greenwich — the chart would
 * attribute a day's consumption to the day before.
 */
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

/**
 * Query string shared by every consumption endpoint. Kept in one place so the
 * SWR keys of the different widgets stay in sync — two widgets disagreeing on
 * the window would show numbers that do not add up.
 */
export function consumptionQueryString(
  selection: ConsumptionPeriodSelection
): string {
  const params = new URLSearchParams({ period: selection.kind });
  if (selection.kind === "days") {
    params.set("days", String(selection.days));
  }
  return params.toString();
}
