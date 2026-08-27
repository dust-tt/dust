import type { AnalyticsVisibleOrigin } from "@app/lib/api/analytics/source_labels";
import { SOURCE_ORIGIN_LABELS } from "@app/lib/api/analytics/source_labels";

export type { AnalyticsVisibleOrigin };

export const OBSERVABILITY_TIME_RANGE = [7, 14, 30, 90] as const;
export type ObservabilityTimeRangeType =
  (typeof OBSERVABILITY_TIME_RANGE)[number];

export const DEFAULT_PERIOD_DAYS = 30;

export const USAGE_METRICS_PALETTE = {
  messages: "text-golden-500",
  conversations: "text-blue-500",
  activeUsers: "text-violet-500",
} as const;

export const ACTIVE_USERS_PALETTE = {
  dau: "text-blue-500",
  wau: "text-violet-500",
  mau: "text-golden-500",
} as const;

export const COST_PALETTE = {
  costMicroUsd: "text-blue-400",
  totalCredits: "text-orange-400",
} as const;

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

export function buildColorClass(baseColor: string, shade: number): string {
  return `text-${baseColor}-${shade}`;
}

export const INDEXED_SHADES = [
  500, 300, 700, 200, 800, 100, 900, 400, 600, 50, 950,
] as const;

export const INDEXED_COLORS = INDEXED_SHADES.flatMap((shade) =>
  INDEXED_BASE_COLORS.map((color) => buildColorClass(color, shade))
);

export const CONVERSATION_FILES_AGGREGATE_KEY = "__conversation_files__";

export const OTHER_LABEL = {
  key: "others",
  label: "Others",
  color: "text-blue-300",
};

export const UNKNOWN_LABEL = {
  key: "unknown",
  label: "Unknown",
  color: "text-muted-foreground",
};

export const FEEDBACK_DISTRIBUTION_PALETTE = {
  positive: "text-green-400",
  negative: "text-rose-400",
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
