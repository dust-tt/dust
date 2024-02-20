import {
  ConfluenceLogo,
  DriveLogo,
  GithubLogo,
  GlobeAltIcon,
  IntercomLogo,
  NotionLogo,
  SlackLogo,
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
    isNested: boolean;
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
    logoComponent: ConfluenceLogo,
    isNested: true,
  },
  notion: {
    name: "Notion",
    connectorProvider: "notion",
    status: "built",
    hide: false,
    description:
      "Authorize granular access to your company's Notion workspace, by top-level pages.",
    limitations: "External files and content behind links are not indexed.",
    logoComponent: NotionLogo,
    isNested: true,
  },
  google_drive: {
    name: "Google Drive™",
    connectorProvider: "google_drive",
    status: "built",
    hide: false,
    description:
      "Authorize granular access to your company's Google Drive, by drives and folders. Supported files include GDocs, GSlides, and .txt files. Email us for .pdf indexing.",
    limitations:
      "Files with empty text content or with more than 750KB of extracted text are ignored. By default, PDF files are not indexed. Email us at team@dust.tt to enable PDF indexing.",
    logoComponent: DriveLogo,
    isNested: true,
  },
  slack: {
    name: "Slack",
    connectorProvider: "slack",
    status: "built",
    hide: false,
    description:
      "Authorize granular access to your Slack workspace on a channel-by-channel basis.",
    limitations: "External files and content behind links are not indexed.",
    logoComponent: SlackLogo,
    isNested: false,
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
    logoComponent: GithubLogo,
    isNested: true,
  },
  intercom: {
    name: "Intercom",
    connectorProvider: "intercom",
    status: "rolling_out",
    rollingOutFlag: "intercom_connection",
    hide: false,
    description:
      "Authorize granular access to your Intercom workspace. Access your Conversations at the Team level and Help Center Articles at the main Collection level.",
    limitations:
      "Dust will index only the conversations from the selected Teams that were initiated within the past 90 days and concluded (marked as closed). For the Help Center data, Dust will index every Article published within a selected Collection.",
    logoComponent: IntercomLogo,
    isNested: true,
  },
  webcrawler: {
    name: "Web Crawler",
    connectorProvider: "webcrawler",
    status: "built",
    hide: true,
    description: "Crawl a website.",
    limitations: null,
    logoComponent: GlobeAltIcon,
    isNested: true,
  },
};
