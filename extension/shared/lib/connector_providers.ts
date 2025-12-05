import type { ConnectorProvider } from "@dust-tt/client";
import {
  BigQueryLogo,
  ConfluenceLogo,
  DiscordLogo,
  DriveLogo,
  FolderIcon,
  GithubLogo,
  GithubWhiteLogo,
  GlobeAltIcon,
  GongLogo,
  IntercomLogo,
  MicrosoftLogo,
  NotionLogo,
  SalesforceLogo,
  SlackLogo,
  SnowflakeLogo,
  ZendeskLogo,
  ZendeskWhiteLogo,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

export type ConnectorProviderConfiguration = {
  name: string;
  getLogoComponent: (
    isDark?: boolean
  ) => (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
};

export function getConnectorProviderLogoWithFallback({
  provider,
  fallback = FolderIcon,
  isDark,
}: {
  provider: ConnectorProvider | null;
  fallback?: ComponentType;
  isDark?: boolean;
}): ComponentType {
  if (!provider) {
    return fallback;
  }
  return CONNECTOR_CONFIGURATIONS[provider].getLogoComponent(isDark);
}

export const CONNECTOR_CONFIGURATIONS: Record<
  ConnectorProvider,
  ConnectorProviderConfiguration
> = {
  confluence: {
    name: "Confluence",
    getLogoComponent: () => {
      return ConfluenceLogo;
    },
  },
  notion: {
    name: "Notion",
    getLogoComponent: () => {
      return NotionLogo;
    },
  },
  google_drive: {
    name: "Google Drive™",
    getLogoComponent: () => {
      return DriveLogo;
    },
  },
  slack: {
    name: "Slack",
    getLogoComponent: () => {
      return SlackLogo;
    },
  },
  slack_bot: {
    name: "Slack (Bot)",
    getLogoComponent: () => {
      return SlackLogo;
    },
  },
  github: {
    name: "GitHub",
    getLogoComponent: (isDark?: boolean) => {
      return isDark ? GithubWhiteLogo : GithubLogo;
    },
  },
  intercom: {
    name: "Intercom",
    getLogoComponent: () => {
      return IntercomLogo;
    },
  },
  microsoft: {
    name: "Microsoft",
    getLogoComponent: () => {
      return MicrosoftLogo;
    },
  },
  webcrawler: {
    name: "Web Crawler",
    getLogoComponent: () => {
      return GlobeAltIcon;
    },
  },
  snowflake: {
    name: "Snowflake",
    getLogoComponent: () => {
      return SnowflakeLogo;
    },
  },
  zendesk: {
    name: "Zendesk",
    getLogoComponent: (isDark?: boolean) => {
      return isDark ? ZendeskWhiteLogo : ZendeskLogo;
    },
  },
  bigquery: {
    name: "BigQuery",
    getLogoComponent: () => {
      return BigQueryLogo;
    },
  },
  salesforce: {
    name: "Salesforce",
    getLogoComponent: () => {
      return SalesforceLogo;
    },
  },
  gong: {
    name: "Gong",
    getLogoComponent: () => {
      return GongLogo;
    },
  },
  discord_bot: {
    name: "Discord (Bot)",
    getLogoComponent: () => {
      return DiscordLogo;
    },
  },
  microsoft_bot: {
    name: "Microsoft (Bot)",
    getLogoComponent: () => {
      return MicrosoftLogo;
    },
  },
};
