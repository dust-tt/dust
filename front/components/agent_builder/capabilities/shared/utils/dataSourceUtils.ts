import type { DataSourceFilterItem } from "@app/components/agent_builder/capabilities/shared/DataSourceFilterContextItem";
import type { DataSourceBuilderTreeType } from "@app/components/data_source_view/context/types";

/**
 * Extracts data source views from the sources tree structure.
 * Handles both data_source and node types, deduplicating by dustAPIDataSourceId.
 *
 * @param sources - The sources tree containing selected data sources
 * @returns A record of DataSourceFilterItem indexed by dustAPIDataSourceId
 */
export function extractDataSourceViews(
  sources: DataSourceBuilderTreeType | undefined | null
): Record<string, DataSourceFilterItem> {
  if (!sources?.in) {
    return {};
  }

  return sources.in.reduce(
    (acc, source) => {
      if (source.type === "data_source") {
        acc[source.dataSourceView.dataSource.dustAPIDataSourceId] = {
          dataSourceView: source.dataSourceView,
        };
      } else if (source.type === "node") {
        acc[source.node.dataSourceView.dataSource.dustAPIDataSourceId] = {
          dataSourceView: source.node.dataSourceView,
        };
      }
      return acc;
    },
    {} as Record<string, DataSourceFilterItem>
  );
}
