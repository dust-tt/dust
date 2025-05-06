import type { DataSourceViewCategory } from "./api/public/spaces";
import type { ContentNodeWithParent } from "./connectors/connectors_api";
import type {
  ConnectorStatusDetails,
  DataSourceType,
  DataSourceWithAgentsUsageType,
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
  updatedAt: number;
  spaceId: string;
}

export type DataSourceViewsWithDetails = DataSourceViewType & {
  dataSource: DataSourceType & ConnectorStatusDetails;
  usage: DataSourceWithAgentsUsageType;
};

export type DataSourceViewContentNode = ContentNodeWithParent & {
  dataSourceView: DataSourceViewType;
};

export type DataSourceViewSelectionConfiguration = {
  dataSourceView: DataSourceViewType;
  selectedResources: DataSourceViewContentNode[];
  isSelectAll: boolean;
  tagsFilter: TagsFilter;
};

export type TagsFilter = {
  in: string[];
  not: string[];
  mode: "custom" | "auto";
} | null;

export function defaultSelectionConfiguration(
  dataSourceView: DataSourceViewType
): DataSourceViewSelectionConfiguration {
  return {
    dataSourceView,
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
