import type { UserMessageOrigin } from "@app/types";

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
  median: "text-violet-300 dark:text-violet-300-night",
} as const;

export const LATENCY_LEGEND = [
  { key: "average", label: "Average" },
  { key: "median", label: "Median" },
] as const;

export const COST_PALETTE = {
  costCents: "text-blue-400 dark:text-blue-400-night",
} as const;

export const COST_LEGEND = [{ key: "costCents", label: "Cost" }] as const;

export const CHART_HEIGHT = 260;

export const TOOL_COLORS = [
  "orange-300 dark:orange-300-night",
  "golden-200 dark:golden-200-night",
  "green-200 dark:green-200-night",
  "violet-300 dark:violet-300-night",
  "rose-300 dark:rose-300-night",
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

export const USER_MESSAGE_ORIGIN_LABELS: Record<
  UserMessageOrigin,
  { label: string; color: string }
> = {
  "github-copilot-chat": {
    label: "GitHub Copilot Chat",
    color: "blue-500 dark:blue-500-night",
  },
  agent_handover: {
    label: "Agent handover",
    color: "gray-300 dark:gray-300-night",
  },
  api: { label: "API", color: "blue-300 dark:blue-300-night" },
  email: { label: "Email", color: "violet-300 dark:violet-300-night" },
  excel: { label: "Excel", color: "rose-300 dark:rose-300-night" },
  extension: {
    label: "Chrome extension",
    color: "golden-300 dark:golden-300-night",
  },
  gsheet: {
    label: "Google Sheets",
    color: "green-300 dark:green-300-night",
  },
  make: { label: "Make", color: "gray-600 dark:gray-600-night" },
  n8n: { label: "n8n", color: "success-muted dark:success-muted-night" },
  powerpoint: {
    label: "PowerPoint",
    color: "violet-500 dark:violet-500-night",
  },
  raycast: {
    label: "Raycast",
    color: "rose-500 dark:rose-500-night",
  },
  run_agent: {
    label: "Sub-agent",
    color: "golden-500 dark:golden-500-night",
  },
  slack: { label: "Slack", color: "green-500 dark:green-500-night" },
  teams: {
    label: "Teams",
    color: "highlight-muted dark:highlight-muted-night",
  },
  transcript: {
    label: "Transcript",
    color: "warning-muted dark:warning-muted-night",
  },
  triggered_programmatic: {
    label: "Trigger",
    color: "info-muted dark:info-muted-night",
  },
  triggered: {
    label: "Trigger",
    color: "info-muted dark:info-muted-night",
  },
  web: { label: "Conversation", color: "blue-500 dark:blue-500-night" },
  zapier: { label: "Zapier", color: "blue-800 dark:blue-800-night" },
  zendesk: {
    label: "Zendesk",
    color: "blue-800 dark:blue-800-night",
  },
};
