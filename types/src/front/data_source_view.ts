import { ModelId } from "../shared/model_id";
import { ConnectorProvider } from "./data_source";

export interface DataSourceViewType {
  connectorId: string | null;
  connectorProvider: ConnectorProvider | null;
  createdAt: number;
  description: string | null;
  dustAPIProjectId: string;
  id: ModelId;
  name: string;
  parentsIn: string[] | null;
  sId: string;
  updatedAt: number;
}
