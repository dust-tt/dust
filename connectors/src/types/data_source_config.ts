export type DataSourceConfig = {
  workspaceAPIKey: string;
  workspaceId: string;
  dataSourceId: string;
};

export type DataSourceInfo = Omit<DataSourceConfig, "workspaceAPIKey">;
