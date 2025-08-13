import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import { findDataSourceViewFromNavigationHistory } from "@app/components/data_source_view/context/utils";
import { DataSourceCategoryBrowser } from "@app/components/data_source_view/DataSourceCategoryBrowser";
import { DataSourceNodeTable } from "@app/components/data_source_view/DataSourceNodeTable";
import { DataSourceViewTable } from "@app/components/data_source_view/DataSourceViewTable";
import type { ContentNodesViewType } from "@app/types";

interface DataSourceNavigationViewProps {
  viewType: ContentNodesViewType;
}

export function DataSourceNavigationView({
  viewType,
}: DataSourceNavigationViewProps) {
  const { navigationHistory } = useDataSourceBuilderContext();
  const currentNavigationEntry =
    navigationHistory[navigationHistory.length - 1];

  const selectedDataSourceView =
    findDataSourceViewFromNavigationHistory(navigationHistory);

  return (
    <>
      {currentNavigationEntry.type === "space" && (
        <DataSourceCategoryBrowser space={currentNavigationEntry.space} />
      )}

      {currentNavigationEntry.type === "category" && <DataSourceViewTable />}

      {(currentNavigationEntry.type === "node" ||
        currentNavigationEntry.type === "data_source") &&
        selectedDataSourceView !== null && (
          <DataSourceNodeTable viewType={viewType} />
        )}
    </>
  );
}
