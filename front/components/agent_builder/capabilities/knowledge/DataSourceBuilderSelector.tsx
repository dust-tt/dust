import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { DataSourceBrowserTable } from "@app/components/agent_builder/capabilities/knowledge/DataSourceBrowserTable";
import { DataSourceSearchResults } from "@app/components/agent_builder/capabilities/knowledge/DataSourceSearchResults";
import { DataSourceSpaceSelector } from "@app/components/agent_builder/capabilities/knowledge/DataSourceSpaceSelector";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { filterBrowsableSpaces } from "@app/components/data_source_view/browser/useBrowsableSpaces";
import {
  getKnowledgeBrowserBreadcrumbItems,
  useKnowledgeBrowserShortcuts,
} from "@app/components/data_source_view/browser/useKnowledgeBrowserNavigation";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import {
  findCategoryFromNavigationHistory,
  findDataSourceViewFromNavigationHistory,
  findSpaceFromNavigationHistory,
  getLatestNodeFromNavigationHistory,
  navigationHistoryEntryTitle,
} from "@app/components/data_source_view/context/utils";
import { useDebounce } from "@app/hooks/useDebounce";
import type { NodeCandidate, UrlCandidate } from "@app/lib/connectors";
import {
  isNodeCandidate,
  isUrlCandidate,
  nodeCandidateFromUrl,
} from "@app/lib/connectors";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import { useAppRouter } from "@app/lib/platform";
import {
  useSpaceProjectsLookup,
  useSpacesSearch,
  useSystemSpace,
} from "@app/lib/swr/spaces";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types/core/utils";
import type { BreadcrumbsItem } from "@dust-tt/sparkle";
import {
  Breadcrumbs,
  Button,
  CloudArrowLeftRight,
  cn,
  SearchInput,
  Separator,
} from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useEffect, useMemo, useState } from "react";

type DataSourceBuilderSelectorProps = {
  viewType: ContentNodesViewType;
  initialRequestedSpaceIds?: string[];
};

export const DataSourceBuilderSelector = ({
  viewType,
  initialRequestedSpaceIds,
}: DataSourceBuilderSelectorProps) => {
  const { owner } = useAgentBuilderContext();
  const { spaces, isSpacesLoading } = useSpacesContext();
  const { supportedDataSourceViews: dataSourceViews } =
    useDataSourceViewsContext();
  const navigation = useDataSourceBuilderContext();
  const { navigationHistory, navigateTo } = navigation;
  const currentNavigationEntry =
    navigationHistory[navigationHistory.length - 1];
  const router = useAppRouter();
  const { systemSpace } = useSystemSpace({ workspaceId: owner.sId });

  const {
    inputValue: searchTerm,
    debouncedValue: debouncedSearch,
    isDebouncing,
    setValue: setSearchTerm,
  } = useDebounce("", {
    delay: 300,
    minLength: MIN_SEARCH_QUERY_SIZE,
  });

  const [nodeOrUrlCandidate, setNodeOrUrlCandidate] = useState<
    UrlCandidate | NodeCandidate | null
  >(null);

  useEffect(() => {
    if (debouncedSearch.length >= MIN_SEARCH_QUERY_SIZE) {
      const candidate = nodeCandidateFromUrl(debouncedSearch.trim());
      setNodeOrUrlCandidate(candidate);
    } else {
      setNodeOrUrlCandidate(null);
    }
  }, [debouncedSearch]);

  // The agent might be linked to some open projects that the user is not
  // a member of, so we fetch them here.
  const missingSpaceIds = useMemo(() => {
    if (!initialRequestedSpaceIds?.length || isSpacesLoading) {
      return [];
    }
    const spaceIds = new Set(spaces.map((s) => s.sId));
    return initialRequestedSpaceIds.filter((id) => !spaceIds.has(id));
  }, [initialRequestedSpaceIds, spaces, isSpacesLoading]);

  const { spaces: missingSpaces } = useSpaceProjectsLookup({
    workspaceId: owner.sId,
    spaceIds: missingSpaceIds,
  });

  const allSpaces = useMemo(() => {
    return [...spaces, ...missingSpaces];
  }, [spaces, missingSpaces]);

  // Only spaces with something to browse, like the knowledge pickers.
  const filteredSpaces = useMemo(
    () => filterBrowsableSpaces(allSpaces, dataSourceViews),
    [allSpaces, dataSourceViews]
  );

  // Enter a lone space directly and skip a pod's category level.
  useKnowledgeBrowserShortcuts({ navigation, spaces: filteredSpaces });

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

  const currentCategory = useMemo(
    () => findCategoryFromNavigationHistory(navigationHistory),
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

    if (currentSpace) {
      if (searchScope === "node" && currentDataSourceView) {
        filter.dataSourceViewIdsBySpaceId = {
          [currentSpace.sId]: [currentDataSourceView.sId],
        };
      } else {
        // Restrict to the data source views of the currently browsed category
        // (e.g. "Websites") so that search results aren't drowned in unrelated
        // resource types (connectors, folders, etc.).
        const dsv = dataSourceViews.filter(
          (dsv) =>
            dsv.spaceId === currentSpace.sId &&
            (!currentCategory || dsv.category === currentCategory)
        );
        filter.dataSourceViewIdsBySpaceId = {
          [currentSpace.sId]: dsv.map((dsv) => dsv.sId),
        };
      }
    }

    // When searching by URL/node candidate, we want to search globally (not restricted by parentId).
    // URLs contain the full document path, so the document might be anywhere in the space,
    // not necessarily within the current folder the user is navigating.
    if (
      searchScope === "node" &&
      currentNode &&
      currentNode.internalId &&
      !nodeOrUrlCandidate
    ) {
      filter.parentId = currentNode.internalId;
    }

    return filter;
  }, [
    currentCategory,
    currentDataSourceView,
    currentNode,
    currentSpace,
    dataSourceViews,
    searchScope,
    nodeOrUrlCandidate,
  ]);

  const {
    searchResultNodes: rawSearchResultNodes,
    isSearchLoading,
    isSearchValidating,
    isSearchError,
  } = useSpacesSearch(
    currentSpace && debouncedSearch
      ? isNodeCandidate(nodeOrUrlCandidate) && nodeOrUrlCandidate.node
        ? {
            owner,
            spaceIds: [currentSpace.sId],
            nodeIds: [nodeOrUrlCandidate.node],
            disabled: !debouncedSearch,
            includeDataSources: false,
            viewType,
            ...searchFilter,
          }
        : {
            owner,
            spaceIds: [currentSpace.sId],
            search: debouncedSearch,
            searchSourceUrls: isUrlCandidate(nodeOrUrlCandidate),
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

  // Process search results and filter by URL if needed
  const searchResultNodes = useMemo(() => {
    // Filter results based on URL match if we have a URL candidate
    if (nodeOrUrlCandidate && !isNodeCandidate(nodeOrUrlCandidate)) {
      return rawSearchResultNodes.filter(
        (node) => node.sourceUrl === nodeOrUrlCandidate.url
      );
    }
    return rawSearchResultNodes;
  }, [rawSearchResultNodes, nodeOrUrlCandidate]);

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

  const breadcrumbItems: BreadcrumbsItem[] = useMemo(() => {
    if (shouldShowSearch && currentSpace) {
      // Space-scope search still filters by currentCategory, so keep it in the breadcrumb.
      if (searchScope === "space") {
        const spaceIndex = navigationHistory.findIndex(
          (entry) => entry.type === "space"
        );
        const lastIndex = currentCategory ? spaceIndex + 1 : spaceIndex;
        const spaceNavigation =
          spaceIndex >= 0 ? navigationHistory.slice(0, lastIndex + 1) : [];

        return getKnowledgeBrowserBreadcrumbItems(
          spaceNavigation,
          navigateTo,
          getBreadcrumbLabel
        );
      }

      // When searching in node scope, show the full path.
      return getKnowledgeBrowserBreadcrumbItems(
        navigationHistory,
        navigateTo,
        getBreadcrumbLabel
      );
    }

    // A pod's skipped category is left out of every trail, like the pickers do.
    return getKnowledgeBrowserBreadcrumbItems(
      navigationHistory,
      navigateTo,
      getBreadcrumbLabel
    );
  }, [
    navigationHistory,
    navigateTo,
    shouldShowSearch,
    currentSpace,
    searchScope,
    currentCategory,
  ]);

  if (filteredSpaces.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col gap-2 px-4 text-center">
          <div className="text-lg font-medium text-foreground">
            No data sources available
          </div>
          <div className="max-w-sm text-muted-foreground">
            Connect data sources or ask your admin to set them up
          </div>
          <div>
            <Button
              icon={CloudArrowLeftRight}
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
        <DataSourceBrowserTable viewType={viewType} />
      )}
    </div>
  );
};

// The sheet has room for full names, so a data source view keeps its stored name here rather than
// the browser's shortened label.
function getBreadcrumbLabel(entry: NavigationHistoryEntryType): string {
  return entry.type === "root" ? "All" : navigationHistoryEntryTitle(entry);
}
