import { ConnectorProvider } from "@app/lib/connectors_api";
import { ModelId } from "@app/lib/databases";

export type DataSourceVisibility = "public" | "private";

export type DataSourceType = {
  id: ModelId;
  name: string;
  description: string | null;
  visibility: DataSourceVisibility;
  assistantDefaultSelected: boolean;
  config: string | null;
  dustAPIProjectId: string;
  connectorId: string | null;
  connectorProvider: ConnectorProvider | null;
};
