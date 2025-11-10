export const OBSERVABILITY_TIME_RANGE = [7, 14, 30, 90] as const;
export type ObservabilityTimeRangeType =
  (typeof OBSERVABILITY_TIME_RANGE)[number];

export const DEFAULT_PERIOD_DAYS = 30;

export const USAGE_METRICS_PALETTE = {
  messages: "text-golden-500 dark:text-golden-500-night",
  conversations: "text-blue-400 dark:text-blue-400-night",
  activeUsers: "text-violet-300 dark:text-violet-300-night",
} as const;

export const USAGE_METRICS_LEGEND = [
  { key: "messages", label: "Messages" },
  { key: "conversations", label: "Conversations" },
  { key: "activeUsers", label: "Active users" },
] as const;

export const LATENCY_PALETTE = {
  average: "text-blue-400 dark:text-blue-400-night",
} as const;

export const LATENCY_LEGEND = [
  { key: "average", label: "Average time to complete output" },
] as const;

export const CHART_HEIGHT = 260;

export const TOOL_COLORS = [
  "text-orange-300 dark:text-orange-300-night",
  "text-golden-200 dark:text-golden-200-night",
  "text-green-200 dark:text-green-200-night",
  "text-violet-300 dark:text-violet-300-night",
  "text-rose-300 dark:text-rose-300-night",
] as const;

export const MAX_TOOLS_DISPLAYED = 5;

export const OTHER_TOOLS_LABEL = "Others";

export const FEEDBACK_DISTRIBUTION_PALETTE = {
  positive: "text-green-400 dark:text-green-400-night",
  negative: "text-rose-400 dark:text-rose-400-night",
} as const;

export const FEEDBACK_DISTRIBUTION_LEGEND = [
  { key: "positive", label: "Positive" },
  { key: "negative", label: "Negative" },
] as const;
