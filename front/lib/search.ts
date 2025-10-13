import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type {
  ContentNodesViewType,
  CoreAPINodesSearchFilter,
  CoreAPISearchScope,
  Result,
} from "@app/types";
import { assertNever, Err, Ok } from "@app/types";

export function getCoreViewTypeFilter(viewType: ContentNodesViewType) {
  switch (viewType) {
    case "document":
      return ["folder", "document"];
    case "table":
      return ["table"];
    case "data_warehouse":
      // For data warehouses, show folders (databases/schemas) and tables.
      return ["folder", "table"];
    case "all":
      return ["folder", "table", "document"];
    default:
      assertNever(viewType);
  }
}

export function searchScopeForDataSource({
  dataSource,
  includeDataSources,
  isSingleDataSource: isSingleDataSource,
}: {
  dataSource: DataSourceResource;
  includeDataSources: boolean;
  isSingleDataSource: boolean;
}): CoreAPISearchScope {
  // On a single datasource view, we never want to match the datasource name.
  if (isSingleDataSource) {
    return "nodes_titles";
  }

  if (includeDataSources) {
    // For webcrawler datasources, we want to search the only datasource
    // title, not the nodes titles.
    if (dataSource.connectorProvider === "webcrawler") {
      return "data_source_name";
    }

    return "both";
  }

  return "nodes_titles";
}

class InvalidSearchFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSearchFilterError";
  }
}

export function getSearchFilterFromDataSourceViews(
  dataSourceViews: DataSourceViewResource[],
  {
    excludedNodeMimeTypes,
    includeDataSources,
    viewType,
    nodeIds,
    parentId,
  }: {
    excludedNodeMimeTypes: readonly string[];
    includeDataSources: boolean;
    viewType: ContentNodesViewType;
    nodeIds?: string[];
    parentId?: string;
  }
): Result<CoreAPINodesSearchFilter, InvalidSearchFilterError> {
  if (includeDataSources && !!nodeIds) {
    return new Err(
      new InvalidSearchFilterError(
        "Cannot filter by node ids when includeDataSources is true (data sources do not have node ids)."
      )
    );
  }

  const groupedPerDataSource = dataSourceViews.reduce(
    (acc, dsv) => {
      const dataSourceId = dsv.dataSource.dustAPIDataSourceId;
      if (!acc.has(dataSourceId)) {
        acc.set(dataSourceId, {
          dataSource: dsv.dataSource,
          dataSourceViews: [],
          parentsIn: [],
        });
      }
      const entry = acc.get(dataSourceId);

      if (entry) {
        entry.dataSourceViews.push(dsv);
        if (dsv.parentsIn && entry.parentsIn !== null) {
          entry.parentsIn?.push(...dsv.parentsIn);
        } else {
          entry.parentsIn = null;
        }
      }

      return acc;
    },
    new Map<
      string,
      {
        dataSource: DataSourceResource;
        dataSourceViews: DataSourceViewResource[];
        parentsIn: string[] | null;
      }
    >()
  );
  const entries = [...groupedPerDataSource.entries()];

  if (entries.length === 0) {
    throw new Error("Must have at least one datasource");
  }

  return new Ok({
    data_source_views: entries.map(([data_source_id, entry]) => ({
      data_source_id,
      view_filter: entry.parentsIn ? [...new Set(entry.parentsIn)] : [],
      search_scope: searchScopeForDataSource({
        dataSource: entry.dataSource,
        includeDataSources,
        isSingleDataSource: entries.length === 1,
      }),
    })),
    mime_types: { not: excludedNodeMimeTypes },
    node_types: getCoreViewTypeFilter(viewType),
    node_ids: nodeIds,
    ...(parentId && { parent_id: parentId }),
  });
}
