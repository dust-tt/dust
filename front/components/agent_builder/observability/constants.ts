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
  costMicroUsd: "text-blue-400 dark:text-blue-400-night",
  totalCredits: "text-green-500 dark:text-green-500-night",
} as const;

export const CHART_HEIGHT = 260;

export const INDEXED_COLORS = [
  "text-orange-300 dark:text-orange-300-night",
  "text-golden-200 dark:text-golden-200-night",
  "text-green-200 dark:text-green-200-night",
  "text-violet-300 dark:text-violet-300-night",
  "text-rose-300 dark:text-rose-300-night",
] as const;

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
  UserMessageOrigin,
  { label: string; color: string }
> = {
  "github-copilot-chat": {
    label: "GitHub Copilot Chat",
    color: "text-blue-500 dark:text-blue-500-night",
  },
  agent_handover: {
    label: "Agent handover",
    color: "text-gray-300 dark:text-gray-300-night",
  },
  api: { label: "API", color: "text-blue-300 dark:text-blue-300-night" },
  cli: { label: "CLI", color: "text-gray-500 dark:text-gray-500-night" },
  cli_programmatic: {
    label: "CLI",
    color: "text-gray-500 dark:text-gray-500-night",
  },
  email: {
    label: "Email",
    color: "text-violet-300 dark:text-violet-300-night",
  },
  excel: { label: "Excel", color: "text-rose-300 dark:text-rose-300-night" },
  extension: {
    label: "Chrome extension",
    color: "text-golden-300 dark:text-golden-300-night",
  },
  gsheet: {
    label: "Google Sheets",
    color: "text-green-300 dark:text-green-300-night",
  },
  make: { label: "Make", color: "text-gray-600 dark:text-gray-600-night" },
  n8n: {
    label: "n8n",
    color: "text-success-muted dark:text-success-muted-night",
  },
  powerpoint: {
    label: "PowerPoint",
    color: "text-violet-500 dark:text-violet-500-night",
  },
  raycast: {
    label: "Raycast",
    color: "rose-500 dark:rose-500-night",
  },
  run_agent: {
    label: "Sub-agent",
    color: "text-golden-500 dark:text-golden-500-night",
  },
  slack: { label: "Slack", color: "text-green-500 dark:text-green-500-night" },
  slack_workflow: {
    label: "Slack",
    color: "text-green-500 dark:text-green-500-night",
  },
  teams: {
    label: "Teams",
    color: "text-highlight-muted dark:text-highlight-muted-night",
  },
  transcript: {
    label: "Transcript",
    color: "text-warning-muted dark:text-warning-muted-night",
  },
  triggered_programmatic: {
    label: "Trigger",
    color: "text-info-muted dark:text-info-muted-night",
  },
  triggered: {
    label: "Trigger",
    color: "text-info-muted dark:text-info-muted-night",
  },
  web: {
    label: "Conversation",
    color: "text-blue-500 dark:text-blue-500-night",
  },
  zapier: { label: "Zapier", color: "text-blue-800 dark:text-blue-800-night" },
  zendesk: {
    label: "Zendesk",
    color: "text-blue-800 dark:text-blue-800-night",
  },
  onboarding_conversation: {
    label: "Onboarding",
    color: "info-muted dark:info-muted-night",
  },
};
