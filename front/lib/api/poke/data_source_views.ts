import type { AgentsUsageType } from "@app/types/data_source";
import type {
  DataSourceViewContentNode,
  DataSourceViewType,
} from "@app/types/data_source_view";
import type { PokeDataSourceViewType } from "@app/types/poke";

export type DataSourceViewWithUsage = DataSourceViewType & {
  usage: AgentsUsageType | null;
};

export type PokeListDataSourceViews = {
  data_source_views: DataSourceViewWithUsage[];
};

export type PokeGetDataSourceViewDetails = {
  dataSourceView: PokeDataSourceViewType;
};

export type PokeGetDataSourceViewContentNodes = {
  nodes: DataSourceViewContentNode[];
  total: number;
  totalIsAccurate: boolean;
  nextPageCursor: string | null;
};
