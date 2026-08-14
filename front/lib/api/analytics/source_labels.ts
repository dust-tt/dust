import type { UserMessageOrigin } from "@app/types/assistant/conversation";

export type AnalyticsVisibleOrigin = Exclude<
  UserMessageOrigin,
  "reinforced_skill_notification" | "system_activation"
>;

export const SOURCE_ORIGIN_LABELS: Record<AnalyticsVisibleOrigin, string> = {
  web: "Conversation",
  extension: "Chrome extension",
  slack: "Slack",
  slack_workflow: "Slack",
  api: "API",
  cli: "CLI",
  cli_programmatic: "CLI",
  gsheet: "Google Sheets",
  email: "Email",
  excel: "Excel",
  teams: "Teams",
  make: "Make",
  n8n: "n8n",
  raycast: "Raycast",
  zapier: "Zapier",
  zendesk: "Zendesk",
  powerpoint: "PowerPoint",
  reinforcement: "Self-improving skills",
  transcript: "Transcript",
  triggered: "Trigger",
  triggered_programmatic: "Trigger",
  wakeup: "Wake-up",
  onboarding_conversation: "Onboarding",
  agent_sidekick: "Sidekick",
  project_kickoff: "Pod Kickoff",
};

function isAnalyticsVisibleOrigin(
  origin: string
): origin is AnalyticsVisibleOrigin {
  return origin in SOURCE_ORIGIN_LABELS;
}

export function sourceLabelForOrigin(origin: string): string | undefined {
  return isAnalyticsVisibleOrigin(origin)
    ? SOURCE_ORIGIN_LABELS[origin]
    : undefined;
}

// Analytics reports on the surface a message came from, not on how it was sent,
// so these origins count as their regular counterpart.
export const SOURCE_BY_PROGRAMMATIC_ORIGIN: Record<
  string,
  AnalyticsVisibleOrigin
> = {
  cli_programmatic: "cli",
  triggered_programmatic: "triggered",
  slack_workflow: "slack",
};

export function normalizeOrigin(
  origin: UserMessageOrigin | null
): UserMessageOrigin | null {
  return origin === null
    ? null
    : (SOURCE_BY_PROGRAMMATIC_ORIGIN[origin] ?? origin);
}

export const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(SOURCE_ORIGIN_LABELS).filter(
    ([origin]) => !(origin in SOURCE_BY_PROGRAMMATIC_ORIGIN)
  )
);
