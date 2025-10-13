import type { InternalConnectorType } from "@app/types/connectors/connectors_api";

import type { DataSourceViewType } from "./data_source_view";
import type { ModelId } from "./shared/model_id";
import type { Result } from "./shared/result";
import { Err, Ok } from "./shared/result";
import type { EditedByUser } from "./user";

export const CONNECTOR_PROVIDERS = [
  "bigquery",
  "confluence",
  "github",
  "gong",
  "google_drive",
  "intercom",
  "microsoft",
  "notion",
  "salesforce",
  "slack",
  "slack_bot",
  "snowflake",
  "webcrawler",
  "zendesk",
] as const;

export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];

export function isConnectorProvider(val: string): val is ConnectorProvider {
  return (CONNECTOR_PROVIDERS as unknown as string[]).includes(val);
}

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

export type ConnectorType = Omit<InternalConnectorType, "connectionId"> & {
  connectionId?: null;
};

export type ConnectorStatusDetails = {
  connector: ConnectorType | null;
  fetchConnectorError: boolean;
  fetchConnectorErrorMessage: string | null;
};

export type DataSourceWithConnectorDetailsType = DataSourceType &
  WithConnector &
  ConnectorStatusDetails;

export type AgentsUsageType = {
  count: number;
  agents: Array<{ sId: string; name: string }>;
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
