export type DataSourceVisibility = "public" | "private";
export type DataSourceConnectorProviders = "slack" | "notion";

export type DataSourceType = {
  name: string;
  description?: string;
  visibility: DataSourceVisibility;
  config?: string;
  dustAPIProjectId: string;
  connector: { id: string; provider: string } | null;
};
