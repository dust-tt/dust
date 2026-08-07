import type { ConnectorProvider } from "@app/types/data_source";

export interface ConnectorMetadata {
  description: string;
  guideLink: string | null;
}

export const CONNECTOR_METADATA = {
  confluence: {
    description:
      "Grant tailored access to your organization's Confluence shared spaces.",
    guideLink: "https://docs.dust.tt/docs/confluence-connection",
  },
  notion: {
    description:
      "Authorize granular access to your company's Notion workspace, by top-level pages.",
    guideLink: "https://docs.dust.tt/docs/notion-connection",
  },
  google_drive: {
    description:
      "Authorize granular access to your company's Google Drive, by drives and folders. Supported files include GDocs, GSlides, and .txt files. Email us for .pdf indexing.",
    guideLink: "https://docs.dust.tt/docs/google-drive-connection",
  },
  slack: {
    description:
      "Authorize granular access to your Slack workspace on a channel-by-channel basis.",
    guideLink: "https://docs.dust.tt/docs/slack-connection",
  },
  github: {
    description:
      "Authorize access to your company's GitHub on a repository-by-repository basis. Dust can access Issues, Discussions, and Pull Request threads. Code indexing can be controlled on-demand.",
    guideLink: "https://docs.dust.tt/docs/github-connection",
  },
  intercom: {
    description:
      "Authorize granular access to your Intercom workspace. Access your Conversations at the Team level and Help Center Articles at the main Collection level.",
    guideLink: "https://docs.dust.tt/docs/intercom-connection",
  },
  microsoft: {
    description:
      "Authorize Dust to access a Microsoft account and index shared documents stored in SharePoint, OneDrive, and Office365.",
    guideLink: "https://docs.dust.tt/docs/microsoft-connection",
  },
  webcrawler: {
    description: "Crawl a website.",
    guideLink: "https://docs.dust.tt/docs/website-connection",
  },
  snowflake: {
    description: "Query a Snowflake database.",
    guideLink: "https://docs.dust.tt/docs/snowflake-connection",
  },
  zendesk: {
    description:
      "Authorize access to Zendesk for indexing tickets from your support center and articles from your help center.",
    guideLink: "https://docs.dust.tt/docs/zendesk-connection",
  },
  bigquery: {
    description: "Query a BigQuery database.",
    guideLink: "https://docs.dust.tt/docs/bigquery",
  },
  salesforce: {
    description:
      "Authorize access to your Salesforce organization, in order to query your Salesforce data from Dust.",
    guideLink: "https://docs.dust.tt/docs/salesforce",
  },
  gong: {
    description: "Authorize access to Gong for indexing call transcripts.",
    guideLink: "https://docs.dust.tt/docs/gong-connection",
  },
} satisfies Partial<Record<ConnectorProvider, ConnectorMetadata>>;

const METADATA_BY_PROVIDER: Partial<
  Record<ConnectorProvider, ConnectorMetadata>
> = CONNECTOR_METADATA;

export function getConnectorMetadata(
  provider: ConnectorProvider
): ConnectorMetadata | undefined {
  return METADATA_BY_PROVIDER[provider];
}
