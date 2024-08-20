import { ModelId } from "../shared/model_id";
import { DataSourceOrViewCategory } from "./api_handlers/public/vaults";
import { ConnectorProvider, EditedByUser } from "./data_source";

export interface DataSourceViewType {
  category: DataSourceOrViewCategory;
  connectorId: string | null;
  connectorProvider: ConnectorProvider | null;
  createdAt: number;
  // TODO(GROUPS_INFRA) Add support for edited by on data source view.
  editedByUser?: EditedByUser | null;
  id: ModelId;
  kind: DataSourceViewKind;
  parentsIn: string[] | null;
  sId: string;
  updatedAt: number;
  // TODO(GROUPS_INFRA) Add support for usage.
  usage: number;
}

export type DataSourceOrView = "data_sources" | "data_source_views";

const DATA_SOURCE_VIEW_KINDS = ["default", "custom"] as const;
export type DataSourceViewKind = (typeof DATA_SOURCE_VIEW_KINDS)[number];
