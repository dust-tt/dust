import { ModelId } from "../shared/model_id";
import { Err, Ok, Result } from "../shared/result";

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

export interface DataSourceOrViewType {
  sId: string;
}

export type DataSourceType = {
  id: ModelId;
  createdAt: number;
  name: string;
  description: string | null;
  assistantDefaultSelected: boolean;
  dustAPIProjectId: string;
  connectorId: string | null;
  connectorProvider: ConnectorProvider | null;
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
