import type { BreadcrumbItem } from "@dust-tt/sparkle";
import { Breadcrumbs, SearchInput } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import { findDataSourceViewFromNavigationHistory } from "@app/components/data_source_view/context/utils";
import { DataSourceCategoryBrowser } from "@app/components/data_source_view/DataSourceCategoryBrowser";
import { DataSourceNodeTable } from "@app/components/data_source_view/DataSourceNodeTable";
import { DataSourceSpaceSelector } from "@app/components/data_source_view/DataSourceSpaceSelector";
import { DataSourceViewTable } from "@app/components/data_source_view/DataSourceViewTable";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import { CATEGORY_DETAILS } from "@app/lib/spaces";
import type {
  ContentNodesViewType,
  DataSourceViewType,
  LightWorkspaceType,
} from "@app/types";

type DataSourceBuilderSelectorProps = {
  owner: LightWorkspaceType;
  dataSourceViews: DataSourceViewType[];
  viewType: ContentNodesViewType;
};

export const DataSourceBuilderSelector = ({
  dataSourceViews,
  viewType,
}: DataSourceBuilderSelectorProps) => {
  const { spaces } = useSpacesContext();
  const { navigationHistory, navigateTo } = useDataSourceBuilderContext();
  const currentNavigationEntry =
    navigationHistory[navigationHistory.length - 1];

  const selectedDataSourceView =
    findDataSourceViewFromNavigationHistory(navigationHistory);

  const [searchQuery, setSearchQuery] = useState("");

  const breadcrumbItems: BreadcrumbItem[] = useMemo(
    () =>
      navigationHistory.map((entry, index) => ({
        ...getBreadcrumbConfig(entry),
        href: undefined,
        onClick: () => navigateTo(index),
      })),
    [navigationHistory, navigateTo]
  );

  // Filter spaces to only those with data source views
  const filteredSpaces = useMemo(() => {
    const spaceIds = new Set(dataSourceViews.map((dsv) => dsv.spaceId));
    return spaces.filter((s) => spaceIds.has(s.sId));
  }, [spaces, dataSourceViews]);

  if (filteredSpaces.length === 0) {
    return <div>No spaces with data sources available.</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {breadcrumbItems.length > 0 && <Breadcrumbs items={breadcrumbItems} />}

      {currentNavigationEntry.type === "root" ? (
        <DataSourceSpaceSelector
          spaces={filteredSpaces}
          allowedSpaces={spaces}
        />
      ) : (
        <SearchInput
          name="search"
          placeholder="Search (Name)"
          value={searchQuery}
          onChange={setSearchQuery}
        />
      )}

      {currentNavigationEntry.type === "space" && (
        <DataSourceCategoryBrowser space={currentNavigationEntry.space} />
      )}

      {currentNavigationEntry.type === "category" && <DataSourceViewTable />}

      {(currentNavigationEntry.type === "node" ||
        currentNavigationEntry.type === "data_source") &&
        selectedDataSourceView !== null && (
          <DataSourceNodeTable viewType={viewType} />
        )}
    </div>
  );
};

function getBreadcrumbConfig(
  entry: NavigationHistoryEntryType
): BreadcrumbItem {
  switch (entry.type) {
    case "root":
      return {
        label: "Knowledge",
      };
    case "space":
      return {
        label: entry.space.name,
      };
    case "category":
      return {
        label: CATEGORY_DETAILS[entry.category].label,
      };
    case "data_source":
      return {
        label: getDataSourceNameFromView(entry.dataSourceView),
      };
    case "node":
      return {
        label: entry.node.title,
      };
  }
}
