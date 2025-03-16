import type { ConnectorType } from "./connectors/connectors_api";
import type { DataSourceViewType } from "./data_source_view";
import type { ModelId } from "./shared/model_id";
import type { Result } from "./shared/result";
import { Err, Ok } from "./shared/result";

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
  "zendesk",
  "bigquery",
  "salesforce",
  "gong",
] as const;

export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];

export function isConnectorProvider(val: string): val is ConnectorProvider {
  return (CONNECTOR_PROVIDERS as unknown as string[]).includes(val);
}

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

export type TagSearchParams = {
  query: string;
  queryType: string;
  dataSourceViews: DataSourceViewType[];
};

export type DataSourceTag = {
  tag: string;
  dustAPIDataSourceId: string;
  connectorProvider: ConnectorProvider | null;
};
