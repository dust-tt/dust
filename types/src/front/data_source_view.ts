import { ModelId } from "../shared/model_id";

export interface DataSourceViewType {
  createdAt: number;
  id: ModelId;
  parentsIn: string[] | null;
  sId: string;
  updatedAt: number;
}

export type DataSourceOrView = "data_sources" | "data_source_views";

const DATA_SOURCE_VIEW_KINDS = ["default", "custom"] as const;
export type DataSourceViewKind = (typeof DATA_SOURCE_VIEW_KINDS)[number];
