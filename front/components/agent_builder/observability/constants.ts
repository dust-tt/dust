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

export const USER_MESSAGE_ORIGIN_LABELS: Record<
  UserMessageOrigin,
  { label: string; color: string }
> = {
  "github-copilot-chat": {
    label: "GitHub Copilot Chat",
    color: "bg-blue-500 dark:bg-blue-500-night",
  },
  agent_handover: {
    label: "Agent handover",
    color: "bg-gray-300 dark:bg-gray-300-night",
  },
  api: { label: "API", color: "bg-blue-300 dark:bg-blue-300-night" },
  email: { label: "Email", color: "bg-violet-300 dark:bg-violet-300-night" },
  excel: { label: "Excel", color: "bg-rose-300 dark:bg-rose-300-night" },
  extension: {
    label: "Chrome extension",
    color: "bg-golden-300 dark:bg-golden-300-night",
  },
  gsheet: {
    label: "Google Sheets",
    color: "bg-green-300 dark:bg-green-300-night",
  },
  make: { label: "Make", color: "bg-gray-600 dark:bg-gray-600-night" },
  n8n: { label: "n8n", color: "bg-success-muted dark:bg-success-muted-night" },
  powerpoint: {
    label: "PowerPoint",
    color: "bg-violet-500 dark:bg-violet-500-night",
  },
  raycast: {
    label: "Raycast",
    color: "bg-rose-500 dark:bg-rose-500-night",
  },
  run_agent: {
    label: "Sub-agent",
    color: "bg-golden-500 dark:bg-golden-500-night",
  },
  slack: { label: "Slack", color: "bg-green-500 dark:bg-green-500-night" },
  teams: {
    label: "Teams",
    color: "bg-highlight-muted dark:bg-highlight-muted-night",
  },
  transcript: {
    label: "Transcript",
    color: "bg-warning-muted dark:bg-warning-muted-night",
  },
  triggered_programmatic: {
    label: "Trigger",
    color: "bg-info-muted dark:bg-info-muted-night",
  },
  triggered: {
    label: "Trigger",
    color: "bg-info-muted dark:bg-info-muted-night",
  },
  web: { label: "Conversation", color: "bg-blue-500 dark:bg-blue-500-night" },
  zapier: { label: "Zapier", color: "bg-blue-800 dark:bg-blue-800-night" },
  zendesk: {
    label: "Zendesk",
    color: "bg-blue-800 dark:bg-blue-800-night",
  },
};

export function isUserMessageOrigin(
  origin?: string | null
): origin is UserMessageOrigin {
  return !!origin && origin in USER_MESSAGE_ORIGIN_LABELS;
}

export function getSourceColor(source: UserMessageOrigin) {
  return USER_MESSAGE_ORIGIN_LABELS[source].color;
}
