import type { BreadcrumbItem } from "@dust-tt/sparkle";
import {
  Breadcrumbs,
  Button,
  CloudArrowLeftRightIcon,
  SearchInput,
} from "@dust-tt/sparkle";
import { Separator } from "@dust-tt/sparkle";
import { cn } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
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

  // Get current space and node for search - memoized to prevent re-rendering issues
  const currentSpace = useMemo(
    () => findSpaceFromNavigationHistory(navigationHistory),
    [navigationHistory]
  );
  const currentNode = useMemo(
    () => getLatestNodeFromNavigationHistory(navigationHistory),
    [navigationHistory]
  );

  const currentDataSourceView = useMemo(
    () => findDataSourceViewFromNavigationHistory(navigationHistory),
    [navigationHistory]
  );

  const [searchScope, setSearchScope] = useState<"node" | "space">("space");

  const searchFilter = useMemo(() => {
    const filter: {
      dataSourceViewIdsBySpaceId?: Record<string, string[]>;
      parentId?: string;
    } = {
      dataSourceViewIdsBySpaceId: undefined,
      parentId: undefined,
    };

    if (searchScope === "node" && currentSpace) {
      const dsv = dataSourceViews.filter(
        (dsv) => dsv.spaceId === currentSpace.sId
      );

      if (currentDataSourceView) {
        filter.dataSourceViewIdsBySpaceId = {
          [currentSpace.sId]: [currentDataSourceView.sId],
        };
      } else {
        filter.dataSourceViewIdsBySpaceId = {
          [currentSpace.sId]: dsv.map((dsv) => dsv.sId),
        };
      }
    }

    if (searchScope === "node" && currentNode && currentNode.internalId) {
      filter.parentId = currentNode.internalId;
    }

    return filter;
  }, [
    currentDataSourceView,
    currentNode,
    currentSpace,
    dataSourceViews,
    searchScope,
  ]);

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
          ...searchFilter,
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

  // Breadcrumbs with search context - defined after showSearch state
  const handleConnectDataClick = () => {
    if (systemSpace) {
      void router.push(`/w/${owner.sId}/spaces/${systemSpace.sId}`);
    }
  };

  const breadcrumbItems: BreadcrumbItem[] = useMemo(() => {
    if (shouldShowSearch && currentSpace) {
      // When searching in space scope, show only up to space level
      if (searchScope === "space") {
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

      // When searching in node scope, show full path (current behavior for node search)
      return navigationHistory.map((entry, index) => ({
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
  }, [
    navigationHistory,
    navigateTo,
    shouldShowSearch,
    currentSpace,
    searchScope,
  ]);

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
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            placeholder={`Search in ${currentSpace?.name || "space"}`}
            value={searchTerm}
            onChange={setSearchTerm}
          />
          {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
          {(currentNode || currentDataSourceView) && isSearching && (
            <div className="flex items-center gap-1 px-1 py-1">
              <span className="mr-2 text-sm text-muted-foreground">
                Searching in:
              </span>
              <div className="flex space-x-3 overflow-hidden rounded-md">
                <Button
                  onClick={() => setSearchScope("node")}
                  variant={searchScope === "node" ? "outline" : "ghost"}
                  label={
                    currentNode
                      ? currentNode.title
                      : currentDataSourceView
                        ? getDataSourceNameFromView(currentDataSourceView)
                        : // should never happen
                          ""
                  }
                  className={cn(
                    searchScope !== "node" && "text-muted-foreground"
                  )}
                />
                <Separator orientation="vertical" />
                <Button
                  onClick={() => setSearchScope("space")}
                  variant={searchScope === "space" ? "outline" : "ghost"}
                  label={`All ${currentSpace?.name}`}
                  className={cn(
                    searchScope !== "space" && "text-muted-foreground"
                  )}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {shouldShowSearch ? (
        <DataSourceSearchResults
          searchResultNodes={
            searchScope === "node" && currentNode?.internalId && debouncedSearch
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
