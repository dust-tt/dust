import { ConnectorProvider } from "@app/lib/connectors_api";

export type DataSourceVisibility = "public" | "private";

export type DataSourceType = {
  name: string;
  description?: string;
  visibility: DataSourceVisibility;
  config?: string;
  dustAPIProjectId: string;
  connector: { id: string; provider: ConnectorProvider } | null;
};
