import { ModelId } from "../shared/model_id";

export const CONNECTOR_PROVIDERS = [
  "confluence",
  "github",
  "google_drive",
  "intercom",
  "notion",
  "slack",
  "webcrawler",
] as const;
export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];

export function isConnectorProvider(val: string): val is ConnectorProvider {
  return (CONNECTOR_PROVIDERS as unknown as string[]).includes(val);
}

export const provider2createConnectorType: Record<
  ConnectorProvider,
  "oauth" | "url"
> = {
  confluence: "oauth",
  github: "oauth",
  google_drive: "oauth",
  slack: "oauth",
  notion: "oauth",
  intercom: "oauth",
  webcrawler: "url",
} as const;

export const PROVIDERS_WITH_SETTINGS: ConnectorProvider[] = ["webcrawler"];
export const DELETION_ALLOWED_BY_TYPE: ConnectorProvider[] = ["webcrawler"];

interface EditedByUser {
  editedAt: number | null;
  fullName: string | null;
  imageUrl: string | null;
}

export type DataSourceType = {
  id: ModelId;
  name: string;
  description: string | null;
  assistantDefaultSelected: boolean;
  dustAPIProjectId: string;
  connectorId: string | null;
  connectorProvider: ConnectorProvider | null;
  editedByUser?: EditedByUser | null;
};
