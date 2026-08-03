import type { SearchWarningCode } from "@app/types/core/core_api";
import type { CoreAPIDocument } from "@app/types/core/data_source";
import type { ConnectorType } from "@app/types/data_source";
import type {
  DataSourceViewContentNode,
  DataSourceViewsWithDetails,
  DataSourceViewType,
} from "@app/types/data_source_view";

export type GetDataSourceViewsResponseBody = {
  dataSourceViews: DataSourceViewType[];
};

export type GetSpaceDataSourceViewsResponseBody<
  IncludeDetails extends boolean = boolean,
> = {
  dataSourceViews: IncludeDetails extends true
    ? DataSourceViewsWithDetails[]
    : DataSourceViewType[];
};

export type PostSpaceDataSourceViewsResponseBody = {
  dataSourceView: DataSourceViewType;
};

export type GetDataSourceViewResponseBody = {
  dataSourceView: DataSourceViewType;
  connector: ConnectorType | null;
};

export type PatchDataSourceViewResponseBody = {
  dataSourceView: DataSourceViewType;
  connector: ConnectorType | null;
};

export type GetDataSourceViewDocumentResponseBody = {
  document: CoreAPIDocument;
};

export type ListTablesResponseBody = {
  tables: DataSourceViewContentNode[];
  nextPageCursor: string | null;
};

export type SearchTablesResponseBody = {
  tables: DataSourceViewContentNode[];
  nextPageCursor: string | null;
  warningCode: SearchWarningCode | null;
};
