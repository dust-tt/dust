import type { DataSourceViewCategory } from "./api/public/spaces";
import type { ContentNodeWithParent } from "./connectors/connectors_api";
import type {
  AgentsUsageType,
  ConnectorStatusDetails,
  DataSourceType,
} from "./data_source";
import type { ModelId } from "./shared/model_id";
import type { EditedByUser } from "./user";

export interface DataSourceViewType {
  category: DataSourceViewCategory;
  createdAt: number;
  dataSource: DataSourceType;
  editedByUser?: EditedByUser | null;
  id: ModelId;
  kind: DataSourceViewKind;
  parentsIn: string[] | null;
  sId: string;
  spaceId: string;
  updatedAt: number;
}

export type DataSourceViewsWithDetails = DataSourceViewType & {
  dataSource: DataSourceType & ConnectorStatusDetails;
  usage: AgentsUsageType;
};

export type DataSourceViewContentNode = ContentNodeWithParent & {
  dataSourceView: DataSourceViewType;
};

export const isEqualNode = (
  lhs: DataSourceViewContentNode,
  rhs: DataSourceViewContentNode
) =>
  lhs.internalId === rhs.internalId &&
  lhs.dataSourceView.dataSource.sId === rhs.dataSourceView.dataSource.sId;

export type DataSourceViewSelectionConfiguration = {
  dataSourceView: DataSourceViewType;
  selectedResources: DataSourceViewContentNode[];
  excludedResources: DataSourceViewContentNode[];
  isSelectAll: boolean;
  tagsFilter: TagsFilter;
};

export type TagsFilterMode = "custom" | "auto";
export type TagsFilter = {
  in: string[];
  not: string[];
  mode: TagsFilterMode;
} | null;

export function defaultSelectionConfiguration(
  dataSourceView: DataSourceViewType
): DataSourceViewSelectionConfiguration {
  return {
    dataSourceView,
    isSelectAll: false,
    selectedResources: [],
    excludedResources: [],
    tagsFilter: null,
  };
}

export type DataSourceViewSelectionConfigurations = Record<
  string, // DataSourceView.sId
  DataSourceViewSelectionConfiguration
>;

const DATA_SOURCE_VIEW_KINDS = ["default", "custom"] as const;
export type DataSourceViewKind = (typeof DATA_SOURCE_VIEW_KINDS)[number];
