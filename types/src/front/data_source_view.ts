import { ModelId } from "../shared/model_id";
import { DataSourceViewCategory } from "./api_handlers/public/vaults";
import { DataSourceType, EditedByUser } from "./data_source";

export interface DataSourceViewType {
  category: DataSourceViewCategory;
  createdAt: number;
  dataSource: DataSourceType;
  // TODO(GROUPS_INFRA) Add support for edited by on data source view.
  editedByUser?: EditedByUser | null;
  id: ModelId;
  kind: DataSourceViewKind;
  parentsIn: string[] | null;
  sId: string;
  updatedAt: number;
  // TODO(GROUPS_INFRA) Add support for usage.
  usage: number;
  vaultId: string;
}

const DATA_SOURCE_VIEW_KINDS = ["default", "custom"] as const;
export type DataSourceViewKind = (typeof DATA_SOURCE_VIEW_KINDS)[number];
