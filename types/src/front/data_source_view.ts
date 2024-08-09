import { ModelId } from "../shared/model_id";
import { ConnectorProvider, EditedByUser } from "./data_source";

export interface DataSourceViewType {
  createdAt: number;
  parentsIn: string[] | null;
  sId: string;
  updatedAt: number;
}

export interface DataSourceOrViewType {
  connectorId: string | null;
  connectorProvider: ConnectorProvider | null;
  createdAt: number;
  description: string | null;
  dustAPIProjectId: string;
  editedByUser: EditedByUser | null;
  id: ModelId;
  // TODO(GROUPS_INFRA) rename name to `sId` once data source has a `sId` field.
  name: string;
  updatedAt: number;
}
