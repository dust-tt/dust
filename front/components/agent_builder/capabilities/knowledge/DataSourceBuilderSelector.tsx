import type { BreadcrumbItem } from "@dust-tt/sparkle";
import {
  Breadcrumbs,
  Button,
  CloudArrowLeftRightIcon,
  SearchInput,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import React from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { DataSourceNavigationView } from "@app/components/agent_builder/capabilities/knowledge/DataSourceNavigationView";
import { DataSourceSearchResults } from "@app/components/agent_builder/capabilities/knowledge/DataSourceSearchResults";
import { DataSourceSpaceSelector } from "@app/components/agent_builder/capabilities/knowledge/DataSourceSpaceSelector";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import { findSpaceFromNavigationHistory } from "@app/components/data_source_view/context/utils";
import { findDataSourceViewFromNavigationHistory } from "@app/components/data_source_view/context/utils";
import { getLatestNodeFromNavigationHistory } from "@app/components/data_source_view/context/utils";
import { useDebounce } from "@app/hooks/useDebounce";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import { CATEGORY_DETAILS } from "@app/lib/spaces";
import { useSpacesSearch, useSystemSpace } from "@app/lib/swr/spaces";
import type { ContentNodesViewType } from "@app/types";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types";

type DataSourceBuilderSelectorProps = {
  viewType: ContentNodesViewType;
};

export const DataSourceBuilderSelector = ({
  viewType,
}: DataSourceBuilderSelectorProps) => {
  const { owner } = useAgentBuilderContext();
  const { spaces } = useSpacesContext();
  const { supportedDataSourceViews: dataSourceViews } =
    useDataSourceViewsContext();
  const { navigationHistory, navigateTo } = useDataSourceBuilderContext();
  const router = useRouter();
  const { systemSpace } = useSystemSpace({ workspaceId: owner.sId });
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
  const currentNode = getLatestNodeFromNavigationHistory(navigationHistory);

  const createSearchFilter = () => {
    const searchFilter: {
      dataSourceViewIdsBySpaceId?: Record<string, string[]>;
      parentId?: string;
    } = {
      dataSourceViewIdsBySpaceId: undefined,
      parentId: undefined,
    };

    if (currentSpace) {
      const dsv = dataSourceViews.filter(
        (dsv) => dsv.spaceId === currentSpace.sId
      );

      const currentDataSourceView =
        findDataSourceViewFromNavigationHistory(navigationHistory);

      if (currentDataSourceView) {
        searchFilter.dataSourceViewIdsBySpaceId = {
          [currentSpace.sId]: [currentDataSourceView.sId],
        };
      } else {
        searchFilter.dataSourceViewIdsBySpaceId = {
          [currentSpace.sId]: dsv.map((dsv) => dsv.sId),
        };
      }
    }

    if (currentNode && currentNode.internalId) {
      searchFilter.parentId = currentNode.internalId;
    }

    return searchFilter;
  };

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
          ...createSearchFilter(),
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

  console.log(">>>>>>> searchResultNodes", searchResultNodes);
  console.log(">>>>>>> currentNode.internalId", currentNode?.internalId);

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
  const handleConnectDataClick = () => {
    if (systemSpace) {
      void router.push(`/w/${owner.sId}/spaces/${systemSpace.sId}`);
    }
  };

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
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col gap-2 px-4 text-center">
          <div className="text-lg font-medium text-foreground">
            No spaces with data sources available
          </div>
          <div className="max-w-sm text-muted-foreground">
            Connect data sources or ask your admin to set them up
          </div>
          <div>
            <Button
              icon={CloudArrowLeftRightIcon}
              label="Connect data"
              variant="primary"
              onClick={handleConnectDataClick}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-1 flex-col gap-4 pt-2">
      {breadcrumbItems.length > 1 && <Breadcrumbs items={breadcrumbItems} />}

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
          searchResultNodes={
            currentNode?.internalId && debouncedSearch
              ? searchResultNodes.filter(
                  (s) => s.internalId !== currentNode.internalId
                )
              : searchResultNodes
          }
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
        label: "Spaces",
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
