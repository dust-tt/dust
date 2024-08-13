export interface DataSourceViewType {
  createdAt: number;
  parentsIn: string[] | null;
  sId: string;
  updatedAt: number;
}

export type DataSourceOrView = "data_sources" | "data_source_views";
