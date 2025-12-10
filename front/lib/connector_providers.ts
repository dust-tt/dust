import type {
  ConnectorProvider,
  PlanType,
  WhitelistableFeature,
} from "@app/types";
import { assertNever } from "@app/types";

export type ConnectorProviderConfiguration = {
  name: string;
  connectorProvider: ConnectorProvider;
  status: "preview" | "built" | "rolling_out";
  rollingOutFlag?: WhitelistableFeature;
  emptyNodeLabel?: string;
  isDeletable: boolean;
};

export const CONNECTOR_CONFIGURATIONS: Record<
  ConnectorProvider,
  ConnectorProviderConfiguration
> = {
  confluence: {
    name: "Confluence",
    connectorProvider: "confluence",
    status: "built",
    isDeletable: false,
  },
  notion: {
    name: "Notion",
    connectorProvider: "notion",
    status: "built",
    isDeletable: false,
  },
  google_drive: {
    name: "Google Drive™",
    connectorProvider: "google_drive",
    status: "built",
    isDeletable: false,
  },
  slack: {
    name: "Slack",
    connectorProvider: "slack",
    status: "rolling_out",
    rollingOutFlag: "self_created_slack_app_connector_rollout",
    isDeletable: false,
  },
  slack_bot: {
    name: "Slack (Bot)",
    connectorProvider: "slack_bot",
    status: "built",
    isDeletable: false,
  },
  discord_bot: {
    name: "Discord (Bot)",
    connectorProvider: "discord_bot",
    status: "rolling_out",
    isDeletable: false,
  },
  github: {
    name: "GitHub",
    connectorProvider: "github",
    status: "built",
    isDeletable: false,
  },
  intercom: {
    name: "Intercom",
    connectorProvider: "intercom",
    status: "built",
    isDeletable: false,
  },
  microsoft: {
    name: "Microsoft",
    connectorProvider: "microsoft",
    status: "built",
    isDeletable: false,
  },
  microsoft_bot: {
    name: "Microsoft Teams (Bot)",
    connectorProvider: "microsoft_bot",
    status: "built",
    isDeletable: false,
  },
  webcrawler: {
    name: "Web Crawler",
    connectorProvider: "webcrawler",
    status: "built",
    isDeletable: true,
  },
  snowflake: {
    name: "Snowflake",
    connectorProvider: "snowflake",
    status: "built",
    isDeletable: true,
  },
  zendesk: {
    name: "Zendesk",
    connectorProvider: "zendesk",
    status: "built",
    isDeletable: false,
  },
  bigquery: {
    name: "BigQuery",
    connectorProvider: "bigquery",
    status: "built",
    isDeletable: true,
  },
  salesforce: {
    name: "Salesforce",
    connectorProvider: "salesforce",
    status: "rolling_out",
    rollingOutFlag: "salesforce_synced_queries",
    isDeletable: false,
  },
  gong: {
    name: "Gong",
    connectorProvider: "gong",
    status: "built",
    isDeletable: false,
  },
};

const WEBHOOK_BASED_CONNECTORS: ConnectorProvider[] = ["slack", "github"];

export function isWebhookBasedProvider(provider: ConnectorProvider): boolean {
  return WEBHOOK_BASED_CONNECTORS.includes(provider);
}

const BOT_TYPE_CONNECTORS: ConnectorProvider[] = [
  "slack_bot",
  "microsoft_bot",
  "discord_bot",
];

export function isBotTypeProvider(provider: ConnectorProvider): boolean {
  return BOT_TYPE_CONNECTORS.includes(provider);
}

export const REMOTE_DATABASE_CONNECTOR_PROVIDERS: ConnectorProvider[] = [
  "snowflake",
  "bigquery",
];

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
    case "microsoft_bot":
    case "slack_bot":
    case "discord_bot":
    case "snowflake":
    case "zendesk":
    case "bigquery":
    case "gong":
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
    case "discord_bot":
    case "salesforce":
    case "snowflake":
    case "webcrawler":
      return false;
    default:
      assertNever(provider);
  }
};

// Bot integrations are connectors that integrate chat apps rather than content sources.
export const isBotIntegration = (provider: ConnectorProvider): boolean => {
  switch (provider) {
    case "slack_bot":
    case "discord_bot":
    case "microsoft_bot":
      return true;
    case "bigquery":
    case "confluence":
    case "github":
    case "gong":
    case "google_drive":
    case "intercom":
    case "microsoft":
    case "notion":
    case "salesforce":
    case "slack":
    case "snowflake":
    case "webcrawler":
    case "zendesk":
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
    case "discord_bot":
      return false;
    default:
      assertNever(connectorType);
  }
}
