import { ModelId } from "../shared/model_id";
import { Err, Ok, Result } from "../shared/result";
import { ConnectorType } from "./lib/connectors_api";

export const CONNECTOR_PROVIDERS = [
  "confluence",
  "github",
  "google_drive",
  "intercom",
  "notion",
  "slack",
  "microsoft",
  "webcrawler",
  "snowflake",
] as const;

export const MANAGED_DS_DELETABLE: ConnectorProvider[] = [
  "webcrawler",
  "snowflake",
];

export const CONNECTOR_TYPE_TO_NAME: Record<ConnectorProvider, string> = {
  confluence: "Confluence",
  github: "GitHub",
  google_drive: "Google Drive",
  intercom: "Intercom",
  notion: "Notion",
  slack: "Slack",
  microsoft: "Microsoft",
  webcrawler: "Website",
  snowflake: "Snowflake",
};

export const CONNECTOR_TYPE_TO_MISMATCH_ERROR: Record<
  ConnectorProvider,
  string
> = {
  confluence: `You cannot select another Confluence Domain.\nPlease contact us at support@dust.tt if you initially selected the wrong Domain.`,
  slack: `You cannot select another Slack Team.\nPlease contact us at support@dust.tt if you initially selected the wrong Team.`,
  notion:
    "You cannot select another Notion Workspace.\nPlease contact us at support@dust.tt if you initially selected a wrong Workspace.",
  github:
    "You cannot create a new Github app installation.\nPlease contact us at support@dust.tt if you initially selected a wrong Organization or if you completely uninstalled the Github app.",
  google_drive:
    "You cannot select another Google Drive Domain.\nPlease contact us at support@dust.tt if you initially selected a wrong shared Drive.",
  intercom:
    "You cannot select another Intercom Workspace.\nPlease contact us at support@dust.tt if you initially selected a wrong Workspace.",
  microsoft: `Microsoft / mismatch error.`,
  webcrawler: "You cannot change the URL. Please add a new Public URL instead.",
  snowflake:
    "You cannot change the Snowflake account. Please add a new Snowflake connection instead.",
};

export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];

export type LabsConnectorProvider = "google_drive" | "gong";

export const WEBHOOK_BASED_CONNECTORS: ConnectorProvider[] = [
  "slack",
  "github",
];

export function isWebhookBasedProvider(provider: ConnectorProvider): boolean {
  return WEBHOOK_BASED_CONNECTORS.includes(provider);
}

export function isConnectorProvider(val: string): val is ConnectorProvider {
  return (CONNECTOR_PROVIDERS as unknown as string[]).includes(val);
}

export const PROVIDERS_WITH_SETTINGS: ConnectorProvider[] = ["webcrawler"];

export type EditedByUser = {
  editedAt: number | null;
  fullName: string | null;
  imageUrl: string | null;
  email: string | null;
  userId: string | null;
};

export type DataSourceType = {
  id: ModelId;
  sId: string;
  createdAt: number;
  name: string;
  description: string | null;
  assistantDefaultSelected: boolean;
  dustAPIProjectId: string;
  dustAPIDataSourceId: string;
  connectorId: string | null;
  connectorProvider: ConnectorProvider | null;
  editedByUser?: EditedByUser | null;
};

export type WithConnector = {
  connectorProvider: ConnectorProvider;
  connectorId: string;
};

export type ConnectorStatusDetails = {
  connector: ConnectorType | null;
  fetchConnectorError: boolean;
  fetchConnectorErrorMessage: string | null;
};

export type DataSourceWithConnectorDetailsType = DataSourceType &
  WithConnector &
  ConnectorStatusDetails;

export type DataSourceWithAgentsUsageType = {
  count: number;
  agentNames: string[];
};

export function isDataSourceNameValid(name: string): Result<void, string> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return new Err("DataSource name cannot be empty");
  }
  if (name.startsWith("managed-")) {
    return new Err("DataSource name cannot start with the prefix `managed-`");
  }

  return new Ok(undefined);
}
