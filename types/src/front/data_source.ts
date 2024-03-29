import { ModelId } from "../shared/model_id";
import { Err, Ok, Result } from "../shared/result";

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

interface EditedByUser {
  editedAt: number | null;
  fullName: string | null;
  imageUrl: string | null;
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
    return new Err("");
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
