import type { BreadcrumbItem } from "@dust-tt/sparkle";
import { Breadcrumbs, SearchInput } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import { DataSourceNavigationView } from "@app/components/agent_builder/capabilities/knowledge/DataSourceNavigationView";
import { DataSourceSearchResults } from "@app/components/agent_builder/capabilities/knowledge/DataSourceSearchResults";
import { DataSourceSpaceSelector } from "@app/components/agent_builder/capabilities/knowledge/DataSourceSpaceSelector";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import { findSpaceFromNavigationHistory } from "@app/components/data_source_view/context/utils";
import { useDebounce } from "@app/hooks/useDebounce";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import { CATEGORY_DETAILS } from "@app/lib/spaces";
import { useSpacesSearch } from "@app/lib/swr/spaces";
import type {
  ContentNodesViewType,
  DataSourceViewType,
  LightWorkspaceType,
} from "@app/types";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types";

type DataSourceBuilderSelectorProps = {
  owner: LightWorkspaceType;
  dataSourceViews: DataSourceViewType[];
  viewType: ContentNodesViewType;
};

export const DataSourceBuilderSelector = ({
  owner,
  dataSourceViews,
  viewType,
}: DataSourceBuilderSelectorProps) => {
  const { spaces } = useSpacesContext();
  const { navigationHistory, navigateTo } = useDataSourceBuilderContext();
  const currentNavigationEntry =
    navigationHistory[navigationHistory.length - 1];

  const {
    inputValue: searchTerm,
    debouncedValue: debouncedSearch,
    isDebouncing,
    setValue: setSearchTerm,
  } = useDebounce("", {
    delay: 300,
    minLength: MIN_SEARCH_QUERY_SIZE,
  });

  // Filter spaces to only those with data source views
  const filteredSpaces = useMemo(() => {
    const spaceIds = new Set(dataSourceViews.map((dsv) => dsv.spaceId));
    return spaces.filter((s) => spaceIds.has(s.sId));
  }, [spaces, dataSourceViews]);

  // Get current space for search - extract from any navigation level
  const currentSpace = findSpaceFromNavigationHistory(navigationHistory);

  const {
    searchResultNodes,
    isSearchLoading,
    isSearchValidating,
    isSearchError,
  } = useSpacesSearch(
    currentSpace && debouncedSearch
      ? {
          owner,
          spaceIds: [currentSpace.sId],
          search: debouncedSearch,
          disabled: !debouncedSearch,
          includeDataSources: true,
          viewType,
          dataSourceViewIdsBySpaceId: {
            [currentSpace.sId]: dataSourceViews
              .filter((dsv) => dsv.spaceId === currentSpace.sId)
              .map((dsv) => dsv.sId),
          },
        }
      : {
          owner,
          spaceIds: [],
          search: "",
          disabled: true,
          includeDataSources: false,
          viewType,
        }
  );

  const isSearching = debouncedSearch.length >= MIN_SEARCH_QUERY_SIZE;
  const isLoading = isDebouncing || isSearchLoading || isSearchValidating;
  const hasError = isSearchError;

  const shouldShowSearch = isSearching && currentSpace;
  const [showSearch, setShowSearch] = useState(shouldShowSearch);

  // Handle transition when search state changes
  useEffect(() => {
    if (shouldShowSearch !== showSearch) {
      const timer = setTimeout(() => {
        setShowSearch(shouldShowSearch);
      }, 150);

      return () => clearTimeout(timer);
    }
  }, [shouldShowSearch, showSearch]);

  // Breadcrumbs with search context - defined after showSearch state
  const breadcrumbItems: BreadcrumbItem[] = useMemo(() => {
    if (showSearch && currentSpace) {
      // When searching, only show path up to space level
      const spaceIndex = navigationHistory.findIndex(
        (entry) => entry.type === "space"
      );
      const spaceNavigation =
        spaceIndex >= 0 ? navigationHistory.slice(0, spaceIndex + 1) : [];

      return spaceNavigation.map((entry, index) => ({
        ...getBreadcrumbConfig(entry),
        href: undefined,
        onClick: () => navigateTo(index),
      }));
    }

    // Normal navigation breadcrumbs
    return navigationHistory.map((entry, index) => ({
      ...getBreadcrumbConfig(entry),
      href: undefined,
      onClick: () => navigateTo(index),
    }));
  }, [navigationHistory, navigateTo, showSearch, currentSpace]);

  if (filteredSpaces.length === 0) {
    return <div>No spaces with data sources available.</div>;
  }

  return (
    <div className="relative flex h-full flex-1 flex-col gap-4">
      {breadcrumbItems.length > 0 && <Breadcrumbs items={breadcrumbItems} />}

      {currentNavigationEntry.type === "root" ? (
        <DataSourceSpaceSelector spaces={filteredSpaces} />
      ) : (
        <div className="flex flex-col gap-2">
          <SearchInput
            name="search"
            placeholder={`Search in ${currentSpace?.name || "space"}`}
            value={searchTerm}
            onChange={setSearchTerm}
          />
        </div>
      )}

      {showSearch ? (
        <DataSourceSearchResults
          currentSpace={currentSpace}
          searchResultNodes={searchResultNodes}
          isLoading={isLoading}
          onClearSearch={() => setSearchTerm("")}
          error={hasError ? new Error("Search failed") : null}
        />
      ) : (
        <DataSourceNavigationView viewType={viewType} />
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
