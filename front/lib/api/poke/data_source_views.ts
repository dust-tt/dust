import type { DataSourceViewWithUsage } from "@app/lib/api/data_source_view";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { PokeDataSourceViewType } from "@app/types/poke";

export type { DataSourceViewWithUsage };

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
