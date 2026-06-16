import {
  type AnalyticsVisibleOrigin,
  SOURCE_ORIGIN_LABELS,
} from "@app/lib/api/analytics/source_labels";

export type { AnalyticsVisibleOrigin };

export const OBSERVABILITY_TIME_RANGE = [7, 14, 30, 90] as const;
export type ObservabilityTimeRangeType =
  (typeof OBSERVABILITY_TIME_RANGE)[number];

export const DEFAULT_PERIOD_DAYS = 30;

export const USAGE_METRICS_PALETTE = {
  messages: "text-golden-500 dark:text-golden-500-night",
  conversations: "text-blue-500 dark:text-blue-500-night",
  activeUsers: "text-violet-500 dark:text-violet-500-night",
} as const;

export const USAGE_METRICS_LEGEND = [
  { key: "messages", label: "Messages" },
  { key: "conversations", label: "Conversations" },
  { key: "activeUsers", label: "Active users" },
] as const;

export const ACTIVE_USERS_PALETTE = {
  dau: "text-blue-500 dark:text-blue-500-night",
  wau: "text-violet-500 dark:text-violet-500-night",
  mau: "text-golden-500 dark:text-golden-500-night",
} as const;

export const ACTIVE_USERS_LEGEND = [
  { key: "dau", label: "DAU" },
  { key: "wau", label: "WAU" },
  { key: "mau", label: "MAU" },
] as const;

export const LATENCY_PALETTE = {
  average: "text-blue-500 dark:text-blue-500-night",
  median: "text-violet-500 dark:text-violet-500-night",
} as const;

export const LATENCY_LEGEND = [
  { key: "average", label: "Average" },
  { key: "median", label: "Median" },
] as const;

export const TOOL_EXECUTION_TIME_PALETTE = {
  avgLatencyMs: "text-blue-500 dark:text-blue-500-night",
  p50LatencyMs: "text-violet-500 dark:text-violet-500-night",
  p95LatencyMs: "text-orange-500 dark:text-orange-500-night",
} as const;

export const TOOL_EXECUTION_TIME_LEGEND = [
  { key: "avgLatencyMs", label: "Average" },
  { key: "p50LatencyMs", label: "P50" },
  { key: "p95LatencyMs", label: "P95" },
] as const;

export const COST_PALETTE = {
  costMicroUsd: "text-blue-400 dark:text-blue-400-night",
  totalCredits: "text-orange-400 dark:text-orange-400-night",
} as const;

export const CHART_HEIGHT = 260;

export const INDEXED_BASE_COLORS = [
  "orange",
  "golden",
  "green",
  "violet",
  "rose",
  "blue",
  "lime",
  "emerald",
  "pink",
  "red",
] as const;

export type IndexedBaseColor = (typeof INDEXED_BASE_COLORS)[number];

export function buildColorClass(baseColor: string, shade: number): string {
  return `text-${baseColor}-${shade} dark:text-${baseColor}-${shade}-night`;
}

export const INDEXED_SHADES = [
  500, 300, 700, 200, 800, 100, 900, 400, 600, 50, 950,
] as const;

export const INDEXED_COLORS = INDEXED_SHADES.flatMap((shade) =>
  INDEXED_BASE_COLORS.map((color) => buildColorClass(color, shade))
);

export const CONVERSATION_FILES_AGGREGATE_KEY = "__conversation_files__";

export const MAX_TOOLS_DISPLAYED = 5;

export const OTHER_LABEL = {
  key: "others",
  label: "Others",
  color: "text-blue-300 dark:text-blue-300-night",
};

export const UNKNOWN_LABEL = {
  key: "unknown",
  label: "Unknown",
  color: "text-gray-400 dark:text-gray-400-night",
};

export const FEEDBACK_DISTRIBUTION_PALETTE = {
  positive: "text-green-400 dark:text-green-400-night",
  negative: "text-rose-400 dark:text-rose-400-night",
} as const;

export const FEEDBACK_DISTRIBUTION_LEGEND = [
  { key: "positive", label: "Positive" },
  { key: "negative", label: "Negative" },
] as const;

export const USER_MESSAGE_ORIGIN_LABELS: Record<
  AnalyticsVisibleOrigin,
  { label: string; color: string }
> = {
  web: { label: SOURCE_ORIGIN_LABELS.web, color: buildColorClass("blue", 500) },
  extension: {
    label: SOURCE_ORIGIN_LABELS.extension,
    color: buildColorClass("orange", 500),
  },
  slack: {
    label: SOURCE_ORIGIN_LABELS.slack,
    color: buildColorClass("green", 500),
  },
  slack_workflow: {
    label: SOURCE_ORIGIN_LABELS.slack_workflow,
    color: buildColorClass("green", 500),
  },
  api: {
    label: SOURCE_ORIGIN_LABELS.api,
    color: buildColorClass("violet", 500),
  },
  cli: { label: SOURCE_ORIGIN_LABELS.cli, color: buildColorClass("gray", 500) },
  cli_programmatic: {
    label: SOURCE_ORIGIN_LABELS.cli_programmatic,
    color: buildColorClass("gray", 500),
  },
  gsheet: {
    label: SOURCE_ORIGIN_LABELS.gsheet,
    color: buildColorClass("emerald", 500),
  },
  email: {
    label: SOURCE_ORIGIN_LABELS.email,
    color: buildColorClass("pink", 500),
  },
  excel: {
    label: SOURCE_ORIGIN_LABELS.excel,
    color: buildColorClass("rose", 500),
  },
  teams: {
    label: SOURCE_ORIGIN_LABELS.teams,
    color: buildColorClass("blue", 300),
  },
  make: {
    label: SOURCE_ORIGIN_LABELS.make,
    color: buildColorClass("gray", 700),
  },
  n8n: { label: SOURCE_ORIGIN_LABELS.n8n, color: buildColorClass("lime", 500) },
  raycast: {
    label: SOURCE_ORIGIN_LABELS.raycast,
    color: buildColorClass("red", 500),
  },
  zapier: {
    label: SOURCE_ORIGIN_LABELS.zapier,
    color: buildColorClass("blue", 700),
  },
  zendesk: {
    label: SOURCE_ORIGIN_LABELS.zendesk,
    color: buildColorClass("golden", 700),
  },
  powerpoint: {
    label: SOURCE_ORIGIN_LABELS.powerpoint,
    color: buildColorClass("violet", 300),
  },
  reinforcement: {
    label: SOURCE_ORIGIN_LABELS.reinforcement,
    color: buildColorClass("emerald", 700),
  },
  transcript: {
    label: SOURCE_ORIGIN_LABELS.transcript,
    color: buildColorClass("golden", 500),
  },
  triggered: {
    label: SOURCE_ORIGIN_LABELS.triggered,
    color: buildColorClass("orange", 700),
  },
  triggered_programmatic: {
    label: SOURCE_ORIGIN_LABELS.triggered_programmatic,
    color: buildColorClass("orange", 300),
  },
  wakeup: {
    label: SOURCE_ORIGIN_LABELS.wakeup,
    color: buildColorClass("violet", 700),
  },
  onboarding_conversation: {
    label: SOURCE_ORIGIN_LABELS.onboarding_conversation,
    color: buildColorClass("rose", 300),
  },
  agent_sidekick: {
    label: SOURCE_ORIGIN_LABELS.agent_sidekick,
    color: buildColorClass("emerald", 300),
  },
  project_kickoff: {
    label: SOURCE_ORIGIN_LABELS.project_kickoff,
    color: buildColorClass("lime", 300),
  },
};
