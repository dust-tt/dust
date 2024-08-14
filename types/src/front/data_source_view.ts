import { ModelId } from "../shared/model_id";

export interface DataSourceViewType {
  createdAt: number;
  id: ModelId;
  parentsIn: string[] | null;
  sId: string;
  updatedAt: number;
}
