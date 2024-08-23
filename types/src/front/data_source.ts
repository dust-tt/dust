import { WhitelistableFeature } from "../shared/feature_flags";
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
] as const;

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
};

export const DEFAULT_EMBEDDING_PROVIDER_ID = "openai";

export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];

export type LabsConnectorProvider = "google_drive" | "gong";

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
  connectorId: string | null;
  connectorProvider: ConnectorProvider | null;
  editedByUser?: EditedByUser | null;
};

export type DataSourceIntegration = {
  name: string;
  dataSourceName: string | null;
  connector: ConnectorType | null;
  fetchConnectorError: boolean;
  fetchConnectorErrorMessage?: string | null;
  status: "preview" | "built" | "rolling_out";
  rollingOutFlag: WhitelistableFeature | null;
  connectorProvider: ConnectorProvider;
  description: string;
  limitations: string | null;
  guideLink: string | null;
  synchronizedAgo: string | null;
  setupWithSuffix: string | null;
  usage: number | null;
  editedByUser?: EditedByUser | null;
};

export function isDataSourceNameValid(name: string): Result<void, string> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return new Err("DataSource name cannot be empty");
  }
  if (name.startsWith("managed-")) {
    return new Err("DataSource name cannot start with the prefix `managed-`");
  }
  // eslint-disable-next-line no-useless-escape
  if (!name.match(/^[a-zA-Z0-9\._\-]+$/)) {
    return new Err(
      "DataSource name must only contain letters, numbers, and the characters `._-`"
    );
  }

  return new Ok(undefined);
}

const STRUCTURED_DATA_SOURCES: ConnectorProvider[] = [
  "google_drive",
  "notion",
  "microsoft",
];

export function isFolder(ds: DataSourceType): boolean {
  // If there is no connectorProvider, it's a folder.
  return !ds.connectorProvider;
}

export function isWebsite(ds: DataSourceType): boolean {
  return ds.connectorProvider === "webcrawler";
}

export function isManaged(ds: DataSourceType): boolean {
  return ds.connectorProvider !== null && !isWebsite(ds);
}

export function canContainStructuredData(ds: DataSourceType): boolean {
  return Boolean(
    isFolder(ds) ||
      (ds.connectorProvider &&
        STRUCTURED_DATA_SOURCES.includes(ds.connectorProvider))
  );
}
