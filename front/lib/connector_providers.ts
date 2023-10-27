import { DriveLogo, GithubLogo, NotionLogo, SlackLogo } from "@dust-tt/sparkle";

import { ConnectorProvider } from "@app/lib/connectors_api";

export const CONNECTOR_CONFIGURATIONS: Record<
  ConnectorProvider,
  {
    name: string;
    connectorProvider: ConnectorProvider;
    isBuilt: boolean;
    logoPath: string;
    logoComponent: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
    description: string;
    isNested: boolean;
  }
> = {
  notion: {
    name: "Notion",
    connectorProvider: "notion",
    isBuilt: true,
    logoPath: "/static/notion_32x32.png",
    description:
      "Authorize granular access to your company's Notion workspace, by top-level pages.",
    logoComponent: NotionLogo,
    isNested: true,
  },
  google_drive: {
    name: "Google Drive™",
    connectorProvider: "google_drive",
    isBuilt: true,
    logoPath: "/static/google_drive_32x32.png",
    description:
      "Authorize granular access to your company's Google Drive, by drives and folders. Supported files include GDocs, GSlides, and .txt files.",
    logoComponent: DriveLogo,
    isNested: true,
  },
  slack: {
    name: "Slack",
    connectorProvider: "slack",
    isBuilt: true,
    logoPath: "/static/slack_32x32.png",
    description:
      "Authorize granular access to your Slack workspace on a channel-by-channel basis.",
    logoComponent: SlackLogo,
    isNested: false,
  },
  github: {
    name: "GitHub",
    connectorProvider: "github",
    isBuilt: true,
    logoPath: "/static/github_black_32x32.png",
    description:
      "Authorize access to your company's GitHub on a repository-by-repository basis. Dust can access Issues, Discussions, and Pull Request threads. Dust does not access code.",
    logoComponent: GithubLogo,
    isNested: false,
  },
};
