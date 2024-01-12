import { ModelId } from "../shared/model_id";

export type DataSourceVisibility = "public" | "private";

export const CONNECTOR_PROVIDERS = [
  "slack",
  "notion",
  "github",
  "google_drive",
  "intercom",
  "webcrawler",
] as const;
export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];

export function isConnectorProvider(val: string): val is ConnectorProvider {
  return (CONNECTOR_PROVIDERS as unknown as string[]).includes(val);
}

export type DataSourceType = {
  id: ModelId;
  name: string;
  description: string | null;
  visibility: DataSourceVisibility;
  assistantDefaultSelected: boolean;
  dustAPIProjectId: string;
  connectorId: string | null;
  connectorProvider: ConnectorProvider | null;
};
