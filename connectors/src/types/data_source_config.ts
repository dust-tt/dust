export type DataSourceConfig = {
  workspaceAPIKey: string;
  workspaceId: string;
  dataSourceId: string | null;
  dataSourceName: string;
};

export type DataSourceInfo = Omit<DataSourceConfig, "workspaceAPIKey">;
