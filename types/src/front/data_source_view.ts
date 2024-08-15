import { ModelId } from "../shared/model_id";

export interface DataSourceViewType {
  createdAt: number;
  id: ModelId;
  parentsIn: string[] | null;
  sId: string;
  updatedAt: number;
}

export type DataSourceOrView = "data_sources" | "data_source_views";
