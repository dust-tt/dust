import {
  ConfluenceLogo,
  DriveLogo,
  GithubLogo,
  GlobeAltIcon,
  IntercomLogo,
  MicrosoftLogo,
  NotionLogo,
  SlackLogo,
  ZendeskLogo,
} from "@dust-tt/sparkle";
import type { ConnectorProvider, WhitelistableFeature } from "@dust-tt/types";

export const CONNECTOR_CONFIGURATIONS: Record<
  ConnectorProvider,
  {
    name: string;
    connectorProvider: ConnectorProvider;
    status: "preview" | "built" | "rolling_out";
    rollingOutFlag?: WhitelistableFeature;
    hide: boolean;
    logoComponent: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
    description: string;
    limitations: string | null;
    guideLink: string | null;
    isNested: boolean;
    isSearchEnabled: boolean;
  }
> = {
  confluence: {
    name: "Confluence",
    connectorProvider: "confluence",
    status: "built",
    hide: false,
    description:
      "Grant tailored access to your organization's Confluence shared spaces.",
    limitations:
      "Dust indexes pages in selected global spaces without any view restrictions. If a page, or its parent pages, have view restrictions, it won't be indexed.",
    guideLink: "https://docs.dust.tt/docs/confluence-connection",
    logoComponent: ConfluenceLogo,
    isNested: true,
    isSearchEnabled: false,
  },
  notion: {
    name: "Notion",
    connectorProvider: "notion",
    status: "built",
    hide: false,
    description:
      "Authorize granular access to your company's Notion workspace, by top-level pages.",
    limitations: "External files and content behind links are not indexed.",
    guideLink: "https://docs.dust.tt/docs/notion-connection",
    logoComponent: NotionLogo,
    isNested: true,
    isSearchEnabled: false,
  },
  google_drive: {
    name: "Google Drive™",
    connectorProvider: "google_drive",
    status: "built",
    hide: false,
    description:
      "Authorize granular access to your company's Google Drive, by drives and folders. Supported files include GDocs, GSlides, and .txt files. Email us for .pdf indexing.",
    limitations:
      "Files with empty text content or with more than 750KB of extracted text are ignored. By default, PDF files are not indexed. Email us at support@dust.tt to enable PDF indexing.",
    guideLink: "https://docs.dust.tt/docs/google-drive-connection",
    logoComponent: DriveLogo,
    isNested: true,
    isSearchEnabled: false,
  },
  slack: {
    name: "Slack",
    connectorProvider: "slack",
    status: "built",
    hide: false,
    description:
      "Authorize granular access to your Slack workspace on a channel-by-channel basis.",
    limitations: "External files and content behind links are not indexed.",
    guideLink: "https://docs.dust.tt/docs/slack-connection",
    logoComponent: SlackLogo,
    isNested: false,
    isSearchEnabled: true,
  },
  github: {
    name: "GitHub",
    connectorProvider: "github",
    status: "built",
    hide: false,
    description:
      "Authorize access to your company's GitHub on a repository-by-repository basis. Dust can access Issues, Discussions, and Pull Request threads. Code indexing can be controlled on-demand.",
    limitations:
      "Dust gathers data from issues, discussions, and pull-requests (top-level discussion, but not in-code comments). It synchronizes your code only if enabled.",
    guideLink: "https://docs.dust.tt/docs/github-connection",
    logoComponent: GithubLogo,
    isNested: true,
    isSearchEnabled: false,
  },
  intercom: {
    name: "Intercom",
    connectorProvider: "intercom",
    status: "built",
    hide: false,
    description:
      "Authorize granular access to your Intercom workspace. Access your Conversations at the Team level and Help Center Articles at the main Collection level.",
    limitations:
      "Dust will index only the conversations from the selected Teams that were initiated within the past 90 days and concluded (marked as closed). For the Help Center data, Dust will index every Article published within a selected Collection.",
    guideLink: "https://docs.dust.tt/docs/intercom-connection",
    logoComponent: IntercomLogo,
    isNested: true,
    isSearchEnabled: false,
  },
  microsoft: {
    name: "Microsoft",
    connectorProvider: "microsoft",
    status: "rolling_out",
    rollingOutFlag: "microsoft_connector",
    hide: false,
    description:
      "Authorize access to Microsoft for indexing shared documents stored in SharePoint, OneDrive, and Office365, and Teams discussions.",
    limitations:
      "Dust will index the documents shared with the authorized account only. Only Teams publi cchannels will be indexed.",
    guideLink: "https://docs.dust.tt/docs/microsoft-connection",
    logoComponent: MicrosoftLogo,
    isNested: true,
    isSearchEnabled: false,
  },
  zendesk: {
    name: "Zendesk",
    connectorProvider: "zendesk",
    status: "rolling_out",
    rollingOutFlag: "zendesk_connector",
    hide: false,
    description:
      "Authorize access to Zendesk for indexing tickets, articles, and comments from your help center.",
    limitations:
      "Dust will index the content accessible to the authorized account only. Attachments are not indexed.",
    guideLink: "https://docs.dust.tt/docs/zendesk-connection",
    logoComponent: ZendeskLogo,
    isNested: false,
    isSearchEnabled: true,
  },
  webcrawler: {
    name: "Web Crawler",
    connectorProvider: "webcrawler",
    status: "built",
    hide: true,
    description: "Crawl a website.",
    limitations: null,
    guideLink: "https://docs.dust.tt/docs/website-connection",
    logoComponent: GlobeAltIcon,
    isNested: true,
    isSearchEnabled: false,
  },
};
