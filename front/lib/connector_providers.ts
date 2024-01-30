import {
  ConfluenceLogo,
  DriveLogo,
  GithubLogo,
  GlobeAltIcon,
  IntercomLogo,
  NotionLogo,
  SlackLogo,
} from "@dust-tt/sparkle";
import type { ConnectorProvider } from "@dust-tt/types";

export const CONNECTOR_CONFIGURATIONS: Record<
  ConnectorProvider,
  {
    name: string;
    connectorProvider: ConnectorProvider;
    status: "preview" | "built-dust-only" | "built";
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
    limitations: null,
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
      "Authorize granular access to your company's Google Drive, by drives and folders. Supported files include GDocs, GSlides, and .txt files. Email us for .pdf indexation.",
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
      "Authorize access to your company's GitHub on a repository-by-repository basis. Dust can access Issues, Discussions, and Pull Request threads. Code indexation is coming soon.",
    limitations:
      "Dust only gathers data from issues, discussions and top-level pull requests (but not in-code comments in pull requests, nor the actual source code or other Github data).",
    logoComponent: GithubLogo,
    isNested: true,
  },
  intercom: {
    name: "Intercom",
    connectorProvider: "intercom",
    status: "built-dust-only", // ROLLOUT INTERCOM
    hide: false,
    description:
      "Authorize access to your Intercom Help Center Collections & Articles. Conversations coming soon.",
    limitations: null,
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
