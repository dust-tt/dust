import {
  ConfluenceLogo,
  DriveLogo,
  FolderIcon,
  GithubLogo,
  GlobeAltIcon,
  IntercomLogo,
  MicrosoftLogo,
  NotionLogo,
  SlackLogo,
  SnowflakeLogo,
} from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  DataSourceType,
  PlanType,
  WhitelistableFeature,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { ComponentType } from "react";

import { GithubCodeEnableView } from "@app/components/data_source/GithubCodeEnableView";
import { IntercomConfigView } from "@app/components/data_source/IntercomConfigView";
import { SlackBotEnableView } from "@app/components/data_source/SlackBotEnableView";

interface ConnectorOptionsProps {
  owner: WorkspaceType;
  readOnly: boolean;
  isAdmin: boolean;
  dataSource: DataSourceType;
  plan: PlanType;
}

export type ConnectorProviderConfiguration = {
  name: string;
  connectorProvider: ConnectorProvider;
  status: "preview" | "built" | "rolling_out";
  rollingOutFlag?: WhitelistableFeature;
  hide: boolean;
  logoComponent: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
  optionsComponent?: (props: ConnectorOptionsProps) => React.JSX.Element;
  description: string;
  limitations: string | null;
  guideLink: string | null;
  selectLabel?: string;
  isNested: boolean;
  isSearchEnabled: boolean;
};

export const CONNECTOR_CONFIGURATIONS: Record<
  ConnectorProvider,
  ConnectorProviderConfiguration
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
    selectLabel: "Select pages",
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
    selectLabel: "Select pages",
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
    selectLabel: "Select folders and files",
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
    selectLabel: "Select channels",
    logoComponent: SlackLogo,
    optionsComponent: SlackBotEnableView,
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
    selectLabel: "Select pages",
    logoComponent: GithubLogo,
    optionsComponent: GithubCodeEnableView,
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
    selectLabel: "Select pages",
    logoComponent: IntercomLogo,
    optionsComponent: IntercomConfigView,
    isNested: true,
    isSearchEnabled: false,
  },
  microsoft: {
    name: "Microsoft",
    connectorProvider: "microsoft",
    status: "built",
    hide: false,
    description:
      "Authorize Dust to access a Microsoft account and index shared documents stored in SharePoint, OneDrive, and Office365.",
    limitations:
      "Dust will only index documents accessible to the account used when making the connection. Only organizational accounts are supported. At the time, personal OneDrives cannot be synced.",
    guideLink: "https://docs.dust.tt/docs/microsoft-connection",
    selectLabel: "Select folders and files",
    logoComponent: MicrosoftLogo,
    isNested: true,
    isSearchEnabled: false,
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
  snowflake: {
    name: "Snowflake",
    connectorProvider: "snowflake",
    status: "rolling_out",
    hide: true,
    description: "Query a Snowflake database.",
    limitations: null,
    logoComponent: SnowflakeLogo,
    isNested: true,
    isSearchEnabled: false,
    guideLink: "https://docs.dust.tt/", // TODO(SNOWFLAKE): Add a doc for snowflake and point.
    selectLabel: "Select tables",
    rollingOutFlag: "snowflake_connector_feature",
  },
};

export function getConnectorProviderLogoWithFallback(
  provider: ConnectorProvider | null,
  fallback: ComponentType = FolderIcon
): ComponentType {
  if (!provider) {
    return fallback;
  }
  return CONNECTOR_CONFIGURATIONS[provider].logoComponent;
}

export const isValidConnectorSuffix = (suffix: string): boolean => {
  return /^[a-z0-9\-_]{1,16}$/.test(suffix);
};

export const isConnectorProviderAllowedForPlan = (
  plan: PlanType,
  provider: ConnectorProvider
): boolean => {
  switch (provider) {
    case "confluence":
      return plan.limits.connections.isConfluenceAllowed;
    case "slack":
      return plan.limits.connections.isSlackAllowed;
    case "notion":
      return plan.limits.connections.isNotionAllowed;
    case "github":
      return plan.limits.connections.isGithubAllowed;
    case "google_drive":
      return plan.limits.connections.isGoogleDriveAllowed;
    case "intercom":
      return plan.limits.connections.isIntercomAllowed;
    case "microsoft":
      return true;
    case "webcrawler":
      return plan.limits.connections.isWebCrawlerAllowed;
    case "snowflake":
      // TODO(SNOWFLAKE): Add a isSnowflakeAllowed column to the plan model.
      return true;
    default:
      assertNever(provider);
  }
};

export const isConnectorProviderAssistantDefaultSelected = (
  provider: ConnectorProvider
): boolean => {
  switch (provider) {
    case "confluence":
    case "slack":
    case "notion":
    case "github":
    case "google_drive":
    case "intercom":
    case "microsoft":
    case "snowflake":
      return true;
    case "webcrawler":
      return false;
    default:
      assertNever(provider);
  }
};

export const isConnectionIdRequiredForProvider = (
  provider: ConnectorProvider
): boolean => {
  switch (provider) {
    case "confluence":
    case "slack":
    case "notion":
    case "github":
    case "google_drive":
    case "intercom":
    case "microsoft":
    case "snowflake":
      return true;
    case "webcrawler":
      return false;
    default:
      assertNever(provider);
  }
};

export function getDefaultDataSourceName(
  provider: ConnectorProvider,
  suffix: string | null
): string {
  return suffix ? `managed-${provider}-${suffix}` : `managed-${provider}`;
}

export function getDefaultDataSourceDescription(
  provider: ConnectorProvider,
  suffix: string | null
): string {
  return suffix
    ? `Managed Data Source for ${provider} (${suffix})`
    : `Managed Data Source for ${provider}`;
}
