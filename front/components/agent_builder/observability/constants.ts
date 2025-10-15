export const OBSERVABILITY_TIME_RANGE = ["7d", "14d", "30d"] as const;
export type ObservabilityTimeRangeType =
  (typeof OBSERVABILITY_TIME_RANGE)[number];

export const OBSERVABILITY_INTERVALS = ["day", "week"] as const;
export type ObservabilityIntervalType =
  (typeof OBSERVABILITY_INTERVALS)[number];

export const USAGE_METRICS_PALETTE = {
  messages: "text-blue-500",
  conversations: "text-amber-500",
  activeUsers: "text-emerald-500",
} as const;

export const USAGE_METRICS_LEGEND = [
  { key: "messages", label: "Messages" },
  { key: "conversations", label: "Conversations" },
  { key: "activeUsers", label: "Active users" },
] as const;

export const CHART_HEIGHT = 260;
