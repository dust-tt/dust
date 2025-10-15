import {
  BigQueryLogo,
  ConfluenceLogo,
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

import { BigQueryUseMetadataForDBMLView } from "@app/components/data_source/BigQueryUseMetadataForDBMLView";
import { createConnectorOptionsPdfEnabled } from "@app/components/data_source/ConnectorOptionsPdfEnabled";
import { GithubCodeEnableView } from "@app/components/data_source/GithubCodeEnableView";
import { GongOptionComponent } from "@app/components/data_source/gong/GongOptionComponent";
import { IntercomConfigView } from "@app/components/data_source/IntercomConfigView";
import { MicrosoftOAuthExtraConfig } from "@app/components/data_source/MicrosoftOAuthExtraConfig";
import { SalesforceOauthExtraConfig } from "@app/components/data_source/salesforce/SalesforceOAuthExtractConfig";
import { SlackBotEnableView } from "@app/components/data_source/SlackBotEnableView";
import { ZendeskConfigView } from "@app/components/data_source/ZendeskConfigView";
import { ZendeskOAuthExtraConfig } from "@app/components/data_source/ZendeskOAuthExtraConfig";
import type {
  ConnectorPermission,
  ConnectorProvider,
  DataSourceType,
  PlanType,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";
import { assertNever } from "@app/types";

export interface ConnectorOptionsProps {
  owner: WorkspaceType;
  readOnly: boolean;
  isAdmin: boolean;
  dataSource: DataSourceType;
  plan: PlanType;
}

export interface ConnectorOauthExtraConfigProps {
  extraConfig: Record<string, string>;
  setExtraConfig: (
    value:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>)
  ) => void;
  setIsExtraConfigValid: (valid: boolean) => void;
}

type ConnectorPermissionsConfigurable =
  | {
      isPermissionsConfigurableBlocked: true;
      permissionsDisabledPlaceholder: string;
    }
  | {
      isPermissionsConfigurableBlocked?: never;
    };

export type ConnectorProviderConfiguration = {
  name: string;
  connectorProvider: ConnectorProvider;
  status: "preview" | "built" | "rolling_out";
  rollingOutFlag?: WhitelistableFeature;
  hide: boolean;
  getLogoComponent: (
    isDark?: boolean
  ) => (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
  optionsComponent?: ComponentType<ConnectorOptionsProps>;
  description: string;
  mismatchError: string;
  limitations: string | null;
  oauthExtraConfigComponent?: (
    props: ConnectorOauthExtraConfigProps
  ) => React.JSX.Element;
  guideLink: string | null;
  selectLabel?: string; // Show in the permissions modal, above the content node tree, note that a connector might not allow to select anything
  isNested: boolean;
  isTitleFilterEnabled?: boolean;
  isResourceSelectionDisabled?: boolean; // Whether the user cannot select distinct resources (everything is synced).
  permissions: {
    selected: ConnectorPermission;
    unselected: ConnectorPermission;
  };
  isDeletable: boolean;
} & ConnectorPermissionsConfigurable;

// TODO(slack 2025-06-19): Remove this function once the new app is published.
export function getConnectorPermissionsConfigurableBlocked(
  provider?: ConnectorProvider | null
): { blocked: boolean; placeholder?: string } {
  if (!provider) {
    return { blocked: false };
  }

  const connectorConfig = CONNECTOR_CONFIGURATIONS[provider];
  const isBlocked = connectorConfig.isPermissionsConfigurableBlocked;

  if (!isBlocked) {
    return { blocked: false };
  }

  return {
    blocked: true,
    placeholder: connectorConfig.permissionsDisabledPlaceholder,
  };
}

export const isConnectorPermissionsEditable = (
  provider?: ConnectorProvider | null
): boolean => {
  if (!provider) {
    return false;
  }

  return (
    CONNECTOR_CONFIGURATIONS[provider].permissions.selected !== "none" ||
    CONNECTOR_CONFIGURATIONS[provider].permissions.unselected !== "none"
  );
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
    mismatchError: `You cannot select another Confluence Domain.\nPlease contact us at support@dust.tt if you initially selected the wrong Domain.`,
    guideLink: "https://docs.dust.tt/docs/confluence-connection",
    selectLabel: "Select pages",
    getLogoComponent: () => {
      return ConfluenceLogo;
    },
    isNested: true,
    permissions: {
      selected: "read",
      unselected: "none",
    },
    isDeletable: false,
  },
  notion: {
    name: "Notion",
    connectorProvider: "notion",
    status: "built",
    hide: false,
    description:
      "Authorize granular access to your company's Notion workspace, by top-level pages.",
    limitations: "External files and content behind links are not indexed.",
    mismatchError: `You cannot select another Notion Workspace.\nPlease contact us at support@dust.tt if you initially selected a wrong Workspace.`,
    guideLink: "https://docs.dust.tt/docs/notion-connection",
    selectLabel: "Synchronized content",
    getLogoComponent: () => {
      return NotionLogo;
    },
    isNested: true,
    permissions: {
      selected: "none",
      unselected: "none",
    },
    isDeletable: false,
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
    mismatchError: `You cannot select another Google Drive Domain.\nPlease contact us at support@dust.tt if you initially selected a wrong shared Drive.`,
    guideLink: "https://docs.dust.tt/docs/google-drive-connection",
    selectLabel: "Select folders and files",
    getLogoComponent: () => {
      return DriveLogo;
    },
    optionsComponent: createConnectorOptionsPdfEnabled(
      "When enabled, PDF documents from your Google Drive will be synced and processed by Dust."
    ),
    isNested: true,
    permissions: {
      selected: "read",
      unselected: "none",
    },
    isDeletable: false,
  },
  slack: {
    name: "Slack",
    connectorProvider: "slack",
    status: "built",
    // TODO(slack 2025-06-19): Hide the Slack connector until we publish the new app.
    hide: true,
    description:
      "Authorize granular access to your Slack workspace on a channel-by-channel basis.",
    limitations: "External files and content behind links are not indexed.",
    mismatchError: `You cannot select another Slack Team.\nPlease contact us at support@dust.tt if you initially selected the wrong Team.`,
    guideLink: "https://docs.dust.tt/docs/slack-connection",
    selectLabel: "Select channels",
    getLogoComponent: () => {
      return SlackLogo;
    },
    optionsComponent: SlackBotEnableView,
    isNested: false,
    isTitleFilterEnabled: true,
    permissions: {
      selected: "read_write",
      unselected: "write",
    },
    isDeletable: false,
  },
  slack_bot: {
    name: "Slack (Bot)",
    connectorProvider: "slack_bot",
    status: "built",
    // Hidden from connections since used as bot integration only. Strings below are therefore all
    // set to N/A
    hide: true,
    isPermissionsConfigurableBlocked: true,
    permissionsDisabledPlaceholder: "N/A",
    description: "N/A",
    limitations: "N/A",
    mismatchError: `You cannot select another Slack Team.\nPlease contact us at support@dust.tt if you initially selected the wrong Team.`,
    guideLink: "https://docs.dust.tt/docs/slack-connection",
    selectLabel: "N/A",
    getLogoComponent: () => {
      return SlackLogo;
    },
    isNested: false,
    isTitleFilterEnabled: true,
    permissions: {
      selected: "read_write",
      unselected: "write",
    },
    isDeletable: false,
  },
  github: {
    name: "GitHub",
    connectorProvider: "github",
    status: "built",
    hide: false,
    description:
      "Authorize access to your company's GitHub on a repository-by-repository basis. Dust can access Issues, Discussions, and Pull Request threads. Code indexing can be controlled on-demand.",
    limitations:
      "Dust gathers data from issues, discussions, and pull-requests (top-level discussion, but not in-code comments). It synchronizes your code only if enabled. At this time, Dust cannot sync code repositories over 10GB. Please contact support@dust.tt if you need to sync larger repositories.",
    mismatchError: `You cannot select another GitHub Organization.\nPlease contact us at support@dust.tt if you initially selected a wrong Organization or if you completely uninstalled the GitHub app.`,
    guideLink: "https://docs.dust.tt/docs/github-connection",
    selectLabel: "Authorized content",
    getLogoComponent: (isDark?: boolean) => {
      return isDark ? GithubWhiteLogo : GithubLogo;
    },
    optionsComponent: GithubCodeEnableView,
    isNested: true,
    permissions: {
      selected: "none",
      unselected: "none",
    },
    isDeletable: false,
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
    mismatchError: `You cannot select another Intercom Workspace.\nPlease contact us at support@dust.tt if you initially selected a wrong Workspace.`,
    guideLink: "https://docs.dust.tt/docs/intercom-connection",
    selectLabel: "Select pages",
    getLogoComponent: () => {
      return IntercomLogo;
    },
    optionsComponent: IntercomConfigView,
    isNested: true,
    permissions: {
      selected: "read",
      unselected: "none",
    },
    isDeletable: false,
  },
  microsoft: {
    name: "Microsoft",
    connectorProvider: "microsoft",
    status: "built",
    hide: false,
    description:
      "Authorize Dust to access a Microsoft account and index shared documents stored in SharePoint, OneDrive, and Office365.",
    limitations:
      "Dust will only index documents accessible to the account used when making the connection. Only organizational accounts are supported (Sharepoint). At the time, OneDrive cannot be synced.",
    mismatchError: `You cannot select another Microsoft account.\nPlease contact us at support@dust.tt if you initially selected a wrong account.`,
    guideLink: "https://docs.dust.tt/docs/microsoft-connection",
    selectLabel: "Select folders and files",
    getLogoComponent: () => {
      return MicrosoftLogo;
    },
    optionsComponent: createConnectorOptionsPdfEnabled(
      "When enabled, PDF documents from your Microsoft OneDrive and SharePoint will be synced and processed by Dust."
    ),
    isNested: true,
    isTitleFilterEnabled: true,
    oauthExtraConfigComponent: MicrosoftOAuthExtraConfig,
    permissions: {
      selected: "read",
      unselected: "none",
    },
    isDeletable: false,
  },
  microsoft_bot: {
    name: "Microsoft Teams (Bot)",
    connectorProvider: "microsoft_bot",
    status: "built",
    rollingOutFlag: "microsoft_teams_bot",
    hide: true,
    description:
      "Enable your Microsoft Teams bot integration to interact with Dust directly from Teams.",
    limitations: "Bot must be enabled in organization settings.",
    mismatchError: `You cannot select another Microsoft tenant.\nPlease contact us at support@dust.tt if you initially selected a wrong tenant.`,
    guideLink: "https://docs.dust.tt/docs/microsoft-teams-bot",
    selectLabel: "Bot configuration",
    getLogoComponent: () => {
      return MicrosoftLogo;
    },
    isNested: false,
    oauthExtraConfigComponent: MicrosoftOAuthExtraConfig,
    permissions: {
      selected: "read_write",
      unselected: "write",
    },
    isDeletable: false,
  },
  webcrawler: {
    name: "Web Crawler",
    connectorProvider: "webcrawler",
    status: "built",
    hide: false,
    description: "Crawl a website.",
    limitations: null,
    mismatchError: `You cannot change the URL. Please add a new Public URL instead.`,
    guideLink: "https://docs.dust.tt/docs/website-connection",
    getLogoComponent: () => {
      return GlobeAltIcon;
    },
    isNested: true,
    permissions: {
      selected: "none",
      unselected: "none",
    },
    isDeletable: true,
  },
  snowflake: {
    name: "Snowflake",
    connectorProvider: "snowflake",
    status: "built",
    hide: false,
    description: "Query a Snowflake database.",
    limitations: null,
    mismatchError: `You cannot change the Snowflake account. Please add a new Snowflake connection instead.`,
    getLogoComponent: () => {
      return SnowflakeLogo;
    },
    isNested: true,
    guideLink: "https://docs.dust.tt/docs/snowflake-connection",
    selectLabel: "Select tables",
    permissions: {
      selected: "read",
      unselected: "none",
    },
    isDeletable: true,
  },
  zendesk: {
    name: "Zendesk",
    connectorProvider: "zendesk",
    status: "built",
    hide: false,
    description:
      "Authorize access to Zendesk for indexing tickets from your support center and articles from your help center.",
    limitations:
      "Dust will index the content accessible to the authorized account only. Attachments are not indexed.",
    mismatchError: `You cannot select another Zendesk Workspace.\nPlease contact us at support@dust.tt if you initially selected a wrong Workspace.`,
    guideLink: "https://docs.dust.tt/docs/zendesk-connection",
    getLogoComponent: (isDark?: boolean) => {
      return isDark ? ZendeskWhiteLogo : ZendeskLogo;
    },
    optionsComponent: ZendeskConfigView,
    oauthExtraConfigComponent: ZendeskOAuthExtraConfig,
    isNested: true,
    permissions: {
      selected: "read",
      unselected: "none",
    },
    isDeletable: false,
  },
  bigquery: {
    name: "BigQuery",
    connectorProvider: "bigquery",
    status: "built",
    hide: false,
    description: "Query a BigQuery database.",
    limitations: null,
    mismatchError: `You cannot change the BigQuery project. Please add a new BigQuery connection instead.`,
    getLogoComponent: () => {
      return BigQueryLogo;
    },
    optionsComponent: BigQueryUseMetadataForDBMLView,
    isNested: true,
    guideLink: "https://docs.dust.tt/docs/bigquery",
    selectLabel: "Select tables",
    permissions: {
      selected: "read",
      unselected: "none",
    },
    isDeletable: true,
  },
  salesforce: {
    name: "Salesforce",
    connectorProvider: "salesforce",
    status: "rolling_out",
    rollingOutFlag: "salesforce_synced_queries",
    hide: true,
    description:
      "Authorize access to your Salesforce organization, in order to query your Salesforce data from Dust.",
    limitations: null,
    mismatchError: `You cannot change the Salesforce instance URL. Please add a new Salesforce connection instead.`,
    getLogoComponent: () => {
      return SalesforceLogo;
    },
    oauthExtraConfigComponent: SalesforceOauthExtraConfig,
    isNested: true,
    permissions: {
      selected: "read",
      unselected: "none",
    },
    isDeletable: false,
    guideLink: "https://docs.dust.tt/docs/salesforce",
  },
  gong: {
    name: "Gong",
    connectorProvider: "gong",
    status: "built",
    isResourceSelectionDisabled: true,
    optionsComponent: GongOptionComponent,
    hide: false,
    description: "Authorize access to Gong for indexing call transcripts.",
    guideLink: "https://docs.dust.tt/docs/gong-connection",
    getLogoComponent: () => {
      return GongLogo;
    },
    isNested: true,
    permissions: {
      selected: "read",
      unselected: "none",
    },
    isDeletable: false,
    limitations:
      "Dust will index the content accessible to the authorized account only. All transcripts will be synchronized with Dust.",
    mismatchError: `You cannot change the Gong account. Please add a new Gong connection instead.`,
  },
};

const WEBHOOK_BASED_CONNECTORS: ConnectorProvider[] = ["slack", "github"];

export function isWebhookBasedProvider(provider: ConnectorProvider): boolean {
  return WEBHOOK_BASED_CONNECTORS.includes(provider);
}

export const REMOTE_DATABASE_CONNECTOR_PROVIDERS: ConnectorProvider[] = [
  "snowflake",
  "bigquery",
];

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

export const isValidConnectorSuffix = (suffix: string): boolean => {
  return /^[a-z0-9\-_]{1,16}$/.test(suffix);
};

export const isConnectorProviderAllowedForPlan = (
  plan: PlanType,
  provider: ConnectorProvider,
  featureFlags: WhitelistableFeature[]
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
    case "webcrawler":
      return plan.limits.connections.isWebCrawlerAllowed;
    case "salesforce":
      return !!featureFlags?.includes("salesforce_synced_queries");
    case "microsoft":
    case "slack_bot":
    case "snowflake":
    case "zendesk":
    case "bigquery":
    case "gong":
      return true;
    case "microsoft_bot":
      return !!featureFlags?.includes("microsoft_teams_bot");
    default:
      assertNever(provider);
  }
};

export const isConnectorProviderAssistantDefaultSelected = (
  provider: ConnectorProvider
): boolean => {
  switch (provider) {
    case "confluence":
    case "github":
    case "gong":
    case "google_drive":
    case "intercom":
    case "microsoft":
    case "microsoft_bot":
    case "notion":
    case "slack":
    case "zendesk":
      return true;
    // As of today (07/02/2025), the default selected provider are going to be used for semantic search
    // Remote database connectors are not available for semantic search so it makes no sense to select them by default
    case "bigquery":
    case "slack_bot":
    case "salesforce":
    case "snowflake":
    case "webcrawler":
      return false;
    default:
      assertNever(provider);
  }
};

export const isConnectionIdRequiredForProvider = (
  provider: ConnectorProvider
): boolean => {
  if (provider === "webcrawler") {
    return false;
  }
  // By default, the connection ID will always be required.
  return true;
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

export function isConnectorTypeTrackable(
  connectorType: ConnectorProvider
): boolean {
  switch (connectorType) {
    case "google_drive":
    case "github":
    case "notion":
    case "microsoft":
    case "microsoft_bot":
    case "confluence":
    case "intercom":
    case "webcrawler":
    case "snowflake":
    case "zendesk":
    case "bigquery":
    case "salesforce":
    case "gong":
      return true;
    case "slack":
    case "slack_bot":
      return false;
    default:
      assertNever(connectorType);
  }
}
