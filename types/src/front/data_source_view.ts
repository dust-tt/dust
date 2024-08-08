import { ModelId } from "../shared/model_id";

export interface DataSourceViewType {
  id: ModelId;
  createdAt: number;
  parentsIn: string[] | null;
  sId: string;
  updatedAt: number;
}
