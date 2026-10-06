import { ASSISTANT_EMAIL_SUBDOMAIN } from "@app/lib/api/assistant/email/constants";

export const CONVERSATION_EXTERNAL_NOTIFICATIONS_LABEL =
  "Email and Slack notifications";
export const CONVERSATION_EXTERNAL_NOTIFICATIONS_DESCRIPTION =
  "Whether members can receive conversation notifications by email or Slack. In-app Dust notifications are not affected.";

export const DUST_MCP_SERVER_LABEL = "MCP server";
export const DUST_MCP_SERVER_DESCRIPTION =
  "Whether external MCP clients can connect to this workspace";

export const EMAIL_AGENTS_LABEL = "Email agents";
export const EMAIL_AGENTS_DESCRIPTION = `Whether members can reach agents by email at AGENT_NAME@${ASSISTANT_EMAIL_SUBDOMAIN}`;

export const INACTIVE_AGENT_ARCHIVAL_LABEL = "Archive unused agents";
export const INACTIVE_AGENT_ARCHIVAL_DESCRIPTION =
  "Automatically archive unused agents";

// Name and description of each messaging app bot, shared with the read-only Poke governance view.
export const MESSAGING_APP_METADATA = {
  slack_bot: {
    name: "Slack Bot",
    description: "Whether the Dust Bot can be used in Slack",
    documentationUrl: "https://docs.dust.tt/docs/slack",
  },
  microsoft_bot: {
    name: "Microsoft Teams Bot",
    description: "Whether the Dust Bot can be used in Microsoft Teams",
    documentationUrl: "https://docs.dust.tt/docs/dust-in-teams",
  },
} as const;

export const OPEN_PODS_POLICIES = [
  {
    value: "private_and_open",
    label: "Restricted and open Pods",
    allowOpenProjects: true,
  },
  {
    value: "private_only",
    label: "Restricted Pods only",
    allowOpenProjects: false,
  },
] as const;

export const OPEN_PODS_LABEL = "Restricted and open Pods";
export const OPEN_PODS_DESCRIPTION =
  "Whether members are allowed to create open Pods";

export const POD_KNOWLEDGE_POLICIES = [
  {
    value: "enabled",
    label: "Manual updates allowed",
    allowManualProjectKnowledgeManagement: true,
  },
  {
    value: "disabled",
    label: "Manual updates disabled",
    allowManualProjectKnowledgeManagement: false,
  },
] as const;

export const POD_KNOWLEDGE_LABEL = "Pod files";
export const POD_KNOWLEDGE_DESCRIPTION =
  "Whether members can manually add files to Pods";

export const PRIVATE_CONVERSATION_URLS_LABEL =
  "Private conversation URLs by default";
export const PRIVATE_CONVERSATION_URLS_DESCRIPTION =
  "Whether conversation URLs are private by default, limiting access to participants";

export const SLACK_PERSONAL_FOOTER_REMOVAL_LABEL =
  '"Sent via Agent" Slack footer';
export const SLACK_PERSONAL_FOOTER_REMOVAL_DESCRIPTION =
  'Whether agents can remove the "Sent via Agent" footer on Slack messages posted with user credentials';

export const VOICE_TRANSCRIPTION_LABEL = "Voice transcription";
export const VOICE_TRANSCRIPTION_DESCRIPTION =
  "Whether members can use voice transcription in conversations";

export const WORKSPACE_ANALYTICS_LABEL = "Workspace Analyst";
export const WORKSPACE_ANALYTICS_DESCRIPTION =
  "Whether workspace admins get the Analyst agent and analytics tools to explore how the workspace is used";

export const WORKSPACE_DEFAULT_AGENT_LABEL = "Default agent";
export const WORKSPACE_DEFAULT_AGENT_DESCRIPTION =
  "The agent pre-selected when anyone starts a new conversation in this workspace";
