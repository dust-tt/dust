export type DataSourceConfig = {
  workspaceAPIKey: string;
  workspaceId: string;
  dataSourceName: string;
};

export type DataSourceInfo = Omit<DataSourceConfig, "workspaceAPIKey">;
