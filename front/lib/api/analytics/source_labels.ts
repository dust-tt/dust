import type { UserMessageOrigin } from "@app/types/assistant/conversation";

export type AnalyticsVisibleOrigin = Exclude<
  UserMessageOrigin,
  "reinforced_skill_notification" | "branch_anchor"
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

export function isAnalyticsVisibleOrigin(
  origin: string
): origin is AnalyticsVisibleOrigin {
  return origin in SOURCE_ORIGIN_LABELS;
}

export function sourceLabelForOrigin(origin: string): string | undefined {
  return isAnalyticsVisibleOrigin(origin)
    ? SOURCE_ORIGIN_LABELS[origin]
    : undefined;
}
