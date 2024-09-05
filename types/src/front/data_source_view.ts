import { ModelId } from "../shared/model_id";
import { DataSourceViewCategory } from "./api_handlers/public/vaults";
import {
  DataSourceType,
  DataSourceWithConnectorDetailsType,
  EditedByUser,
} from "./data_source";
import { BaseContentNode } from "./lib/connectors_api";

export interface DataSourceViewType {
  category: DataSourceViewCategory;
  createdAt: number;
  dataSource: DataSourceType;
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

export type DataSourceViewWithConnectorType = DataSourceViewType & {
  dataSource: DataSourceWithConnectorDetailsType;
};

export type DataSourceViewContentNode = BaseContentNode & {
  parentInternalIds: string[] | null;
};

export type DataSourceViewSelectionConfiguration = {
  dataSourceView: DataSourceViewType;
  selectedResources: DataSourceViewContentNode[];
  isSelectAll: boolean;
};

export function defaultSelectionConfiguration(
  dataSourceView: DataSourceViewType
): DataSourceViewSelectionConfiguration {
  return {
    dataSourceView,
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
