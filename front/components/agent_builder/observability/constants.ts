const OBSERVABILITY_TIME_RANGE = ["7d", "14d", "30d"] as const;
export type ObservabilityTimeRangeType =
  (typeof OBSERVABILITY_TIME_RANGE)[number];

const OBSERVABILITY_INTERVALS = ["day", "week"] as const;
export type ObservabilityIntervalType =
  (typeof OBSERVABILITY_INTERVALS)[number];

export const OBSERVABILITY_PALETTE = [
  "text-blue-500",
  "text-violet-500",
  "text-emerald-500",
  "text-amber-500",
  "text-rose-500",
  "text-cyan-500",
];
