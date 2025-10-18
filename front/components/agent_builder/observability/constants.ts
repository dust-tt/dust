export const OBSERVABILITY_TIME_RANGE = [7, 14, 30] as const;
export type ObservabilityTimeRangeType =
  (typeof OBSERVABILITY_TIME_RANGE)[number];

export const DEFAULT_PERIOD_DAYS = 14;

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

export const VERSION_MARKER_STYLE = {
  stroke: "#f59e0b",
  strokeWidth: 2,
  strokeDasharray: "5 5",
  labelFontSize: 12,
  labelOffsetBase: 10,
  labelOffsetIncrement: 15,
} as const;

export const TOOL_COLORS = [
  "text-blue-500",
  "text-emerald-500",
  "text-amber-500",
  "text-purple-500",
  "text-pink-500",
  "text-cyan-500",
  "text-orange-500",
  "text-teal-500",
  "text-indigo-500",
  "text-rose-500",
] as const;

export const MAX_TOOLS_DISPLAYED = 10;
export const PERCENTAGE_MULTIPLIER = 100;
