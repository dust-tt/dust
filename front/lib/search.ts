import type {
  ContentNodesViewType,
  CoreAPISearchScope,
  LightWorkspaceType,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";

import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";

export function getCoreViewTypeFilter(viewType: ContentNodesViewType) {
  switch (viewType) {
    case "document":
      return ["folder", "document"];
    case "table":
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

export function getSearchFilterFromDataSourceViews(
  workspace: LightWorkspaceType,
  dataSourceViews: DataSourceViewResource[],
  {
    excludedNodeMimeTypes,
    includeDataSources,
    viewType,
  }: {
    excludedNodeMimeTypes: readonly string[];
    includeDataSources: boolean;
    viewType: ContentNodesViewType;
  }
) {
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

  return {
    data_source_views: entries.map(([data_source_id, entry]) => ({
      data_source_id,
      view_filter: entry.parentsIn ? [...new Set(entry.parentsIn)] : [],
      search_scope: searchScopeForDataSource({
        dataSource: entry.dataSource,
        includeDataSources,
        isSingleDataSource: entries.length === 1,
      }),
    })),
    excluded_node_mime_types: excludedNodeMimeTypes,
    node_types: getCoreViewTypeFilter(viewType),
  };
}
