// Marketing slim version: the full UI configuration lives in front and is
// tied to the authenticated data-source flow. Marketing's integration registry
// only needs each connector's marketing description + documentation link, so
// this exports a minimal map. Add entries as the integrations grid grows.
import type { ConnectorProvider } from "@marketing/types/data_source";

export interface MarketingConnectorUIConfig {
  description: string;
  guideLink: string | null;
}

export const CONNECTOR_UI_CONFIGURATIONS: Record<
  ConnectorProvider,
  MarketingConnectorUIConfig
> = {
  bigquery: {
    description: "Sync BigQuery tables to query them with AI agents.",
    guideLink: null,
  },
  confluence: {
    description: "Connect Confluence spaces to Dust.",
    guideLink: null,
  },
  discord_bot: {
    description: "Bring Dust into Discord channels.",
    guideLink: null,
  },
  dust_project: {
    description: "Internal Dust project connector.",
    guideLink: null,
  },
  github: {
    description: "Connect GitHub repositories to Dust.",
    guideLink: null,
  },
  gong: {
    description: "Connect Gong call recordings and transcripts.",
    guideLink: null,
  },
  google_drive: {
    description: "Connect Google Drive files and folders.",
    guideLink: null,
  },
  intercom: {
    description: "Connect Intercom conversations and articles.",
    guideLink: null,
  },
  microsoft: {
    description: "Connect Microsoft 365 (SharePoint, OneDrive) to Dust.",
    guideLink: null,
  },
  microsoft_bot: {
    description: "Bring Dust into Microsoft Teams channels.",
    guideLink: null,
  },
  notion: {
    description: "Connect Notion workspaces, databases, and pages.",
    guideLink: null,
  },
  salesforce: {
    description: "Connect Salesforce records and reports.",
    guideLink: null,
  },
  slack: {
    description: "Connect Slack channels and messages.",
    guideLink: null,
  },
  slack_bot: {
    description: "Bring Dust into Slack channels.",
    guideLink: null,
  },
  snowflake: {
    description: "Sync Snowflake tables to query them with AI agents.",
    guideLink: null,
  },
  webcrawler: {
    description: "Crawl public web pages into Dust.",
    guideLink: null,
  },
  zendesk: {
    description: "Connect Zendesk tickets and help center articles.",
    guideLink: null,
  },
};
