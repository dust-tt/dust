import { ConnectorProvider } from "@app/lib/connectors_api";
import { ModelId } from "@app/lib/databases";

export type DataSourceVisibility = "public" | "private";

export type DataSourceType = {
  id: ModelId;
  name: string;
  description?: string;
  visibility: DataSourceVisibility;
  assistantDefaultSelected: boolean;
  config?: string;
  dustAPIProjectId: string;
  connectorId?: string;
  connectorProvider?: ConnectorProvider;
};
