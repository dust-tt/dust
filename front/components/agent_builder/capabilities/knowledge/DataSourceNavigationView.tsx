import { DataSourceCategoryBrowser } from "@app/components/agent_builder/capabilities/knowledge/DataSourceCategoryBrowser";
import { DataSourceNodeTable } from "@app/components/agent_builder/capabilities/knowledge/DataSourceNodeTable";
import { DataSourceViewTable } from "@app/components/agent_builder/capabilities/knowledge/DataSourceViewTable";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import { findDataSourceViewFromNavigationHistory } from "@app/components/data_source_view/context/utils";
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

      {currentNavigationEntry.type === "category" && (
        <DataSourceViewTable viewType={viewType} />
      )}

      {(currentNavigationEntry.type === "node" ||
        currentNavigationEntry.type === "data_source") &&
        selectedDataSourceView !== null && (
          <DataSourceNodeTable viewType={viewType} />
        )}
    </>
  );
}
