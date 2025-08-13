import type { BreadcrumbItem } from "@dust-tt/sparkle";
import { Breadcrumbs, cn, SearchInput } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import { DataSourceNavigationView } from "@app/components/data_source_view/DataSourceNavigationView";
import { DataSourceSearchResults } from "@app/components/data_source_view/DataSourceSearchResults";
import { DataSourceSpaceSelector } from "@app/components/data_source_view/DataSourceSpaceSelector";
import { useDebounce } from "@app/hooks/useDebounce";
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

  // Get current space for search
  const currentSpace =
    currentNavigationEntry.type === "space"
      ? currentNavigationEntry.space
      : null;

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
  const [isChanging, setIsChanging] = useState(false);
  const [showSearch, setShowSearch] = useState(shouldShowSearch);

  // Handle transition when search state changes
  useEffect(() => {
    if (shouldShowSearch !== showSearch) {
      setIsChanging(true);
      const timer = setTimeout(() => {
        setShowSearch(shouldShowSearch);
        setTimeout(() => setIsChanging(false), 50);
      }, 150);

      return () => clearTimeout(timer);
    }
  }, [shouldShowSearch, showSearch]);

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
          placeholder={`Search in ${currentSpace?.name || "space"}`}
          value={searchTerm}
          onChange={setSearchTerm}
        />
      )}

      <div
        className={cn(
          "transition-opacity duration-150",
          isChanging && "opacity-0"
        )}
      >
        {showSearch ? (
          <DataSourceSearchResults
            searchResultNodes={searchResultNodes}
            isLoading={isLoading}
            onClearSearch={() => setSearchTerm("")}
            error={hasError ? new Error("Search failed") : null}
          />
        ) : (
          <DataSourceNavigationView viewType={viewType} />
        )}
      </div>
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
        label: entry.dataSourceView.dataSource.name,
      };
    case "node":
      return {
        label: entry.node.title,
      };
  }
}
