export type DataSourceVisibility = "public" | "private";

export type DataSourceType = {
  name: string;
  description?: string;
  visibility: DataSourceVisibility;
  config?: string;
  dustAPIProjectId: string;
};
