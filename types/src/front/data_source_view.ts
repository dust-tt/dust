import { ModelId } from "../shared/model_id";
import { DataSourceViewCategory } from "./api_handlers/public/spaces";
import {
  ConnectorStatusDetails,
  DataSourceType,
  DataSourceWithAgentsUsageType,
  EditedByUser,
} from "./data_source";
import { ContentNode } from "./lib/connectors_api";

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
  spaceId: string;
}

export type DataSourceViewsWithDetails = DataSourceViewType & {
  dataSource: DataSourceType & ConnectorStatusDetails;
  usage: DataSourceWithAgentsUsageType;
};

export type DataSourceViewContentNode = ContentNode & {
  parentInternalIds: string[] | null;
};

export type DataSourceViewSelectionConfiguration = {
  dataSourceView: DataSourceViewType;
  selectedResources: DataSourceViewContentNode[];
  isSelectAll: boolean;
  tagsFilter: { in: string[]; not: string[] } | "auto" | null;
};

export function defaultSelectionConfiguration(
  dataSourceView: DataSourceViewType
): DataSourceViewSelectionConfiguration {
  return {
    dataSourceView: dataSourceView,
    isSelectAll: false,
    selectedResources: [],
    tagsFilter: null,
  };
}

export type DataSourceViewSelectionConfigurations = Record<
  string, // DataSourceView.sId
  DataSourceViewSelectionConfiguration
>;

const DATA_SOURCE_VIEW_KINDS = ["default", "custom"] as const;
export type DataSourceViewKind = (typeof DATA_SOURCE_VIEW_KINDS)[number];
