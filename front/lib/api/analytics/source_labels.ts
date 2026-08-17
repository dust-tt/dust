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

// Analytics reports on the surface a message came from, not on how it was sent,
// so these origins count as their regular counterpart.
export const PROGRAMMATIC_ORIGIN_TO_SOURCE: Record<
  AnalyticsVisibleOrigin,
  AnalyticsVisibleOrigin
> = {
  web: "web",
  extension: "extension",
  slack: "slack",
  slack_workflow: "slack",
  api: "api",
  cli: "cli",
  cli_programmatic: "cli",
  gsheet: "gsheet",
  email: "email",
  excel: "excel",
  teams: "teams",
  make: "make",
  n8n: "n8n",
  raycast: "raycast",
  zapier: "zapier",
  zendesk: "zendesk",
  powerpoint: "powerpoint",
  reinforcement: "reinforcement",
  transcript: "transcript",
  triggered: "triggered",
  triggered_programmatic: "triggered",
  wakeup: "wakeup",
  onboarding_conversation: "onboarding_conversation",
  agent_sidekick: "agent_sidekick",
  project_kickoff: "project_kickoff",
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

export function normalizeOrigin(
  origin: UserMessageOrigin | null
): UserMessageOrigin | null {
  if (origin === null || !isAnalyticsVisibleOrigin(origin)) {
    return null;
  }
  return PROGRAMMATIC_ORIGIN_TO_SOURCE[origin];
}
