export const OBSERVABILITY_TIME_RANGE = [7, 14, 30] as const;
export type ObservabilityTimeRangeType =
  (typeof OBSERVABILITY_TIME_RANGE)[number];

export const DEFAULT_PERIOD_DAYS = 14;

export const USAGE_METRICS_PALETTE = {
  messages: "text-[hsl(var(--chart-1))]",
  conversations: "text-[hsl(var(--chart-2))]",
  activeUsers: "text-[hsl(var(--chart-3))]",
} as const;

export const USAGE_METRICS_LEGEND = [
  { key: "messages", label: "Messages" },
  { key: "conversations", label: "Conversations" },
  { key: "activeUsers", label: "Active users" },
] as const;

export const CHART_HEIGHT = 260;

export const VERSION_MARKER_STYLE = {
  stroke: "hsl(var(--primary))",
  strokeWidth: 2,
  strokeDasharray: "5 5",
  labelFontSize: 12,
  labelOffsetBase: 10,
  labelOffsetIncrement: 15,
} as const;

// TODO: find a way to display more tools
export const TOOL_COLORS = [
  "text-[hsl(var(--chart-1))]",
  "text-[hsl(var(--chart-2))]",
  "text-[hsl(var(--chart-3))]",
  "text-[hsl(var(--chart-4))]",
  "text-[hsl(var(--chart-5))]",
] as const;

export const MAX_TOOLS_DISPLAYED = 5;
export const PERCENTAGE_MULTIPLIER = 100;
