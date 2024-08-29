import { ModelId } from "../shared/model_id";
import {
  DataSourceViewCategory,
  LightContentNode,
} from "./api_handlers/public/vaults";
import { DataSourceType, EditedByUser } from "./data_source";
import { BaseContentNode } from "./lib/connectors_api";

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

export type DataSourceViewSelectionConfiguration = {
  dataSourceView: DataSourceViewType;
  selectedResources: LightContentNode[];
  isSelectAll: boolean;
};

export function defaultSelectionConfiguration(
  dataSourceView: DataSourceViewType
): DataSourceViewSelectionConfiguration {
  return {
    dataSourceView: dataSourceView,
    isSelectAll: false,
    selectedResources: [],
  };
}

export type DataSourceViewSelectionConfigurations = Record<
  string, // DataSourceView.sId
  DataSourceViewSelectionConfiguration
>;

const DATA_SOURCE_VIEW_KINDS = ["default", "custom"] as const;
export type DataSourceViewKind = (typeof DATA_SOURCE_VIEW_KINDS)[number];

export type DataSourceViewContentNode = BaseContentNode & {
  parentInternalIds: string[] | null;
};
