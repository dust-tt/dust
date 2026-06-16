export const CONNECTOR_PROVIDERS = [
  "bigquery",
  "confluence",
  "discord_bot",
  "dust_project",
  "github",
  "gong",
  "google_drive",
  "intercom",
  "microsoft",
  "microsoft_bot",
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
  id: number;
  sId: string;
  createdAt: number;
  name: string;
  description: string | null;
  assistantDefaultSelected: boolean;
  dustAPIProjectId: string;
  dustAPIDataSourceId: string;
  connectorId: string | null;
  connectorProvider: ConnectorProvider | null;
};
