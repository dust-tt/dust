import type { MenuItem } from "@dust-tt/sparkle";
import {
  cn,
  ScrollableDataTable,
  SearchInput,
  useHashParam,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React from "react";

import { DocumentOrTableDeleteDialog } from "@app/components/data_source/DocumentOrTableDeleteDialog";
import DataSourceViewDocumentModal from "@app/components/DataSourceViewDocumentModal";
import type { ContentActionsRef } from "@app/components/spaces/ContentActions";
import { getMenuItems } from "@app/components/spaces/ContentActions";
import { makeColumnsForSearchResults } from "@app/components/spaces/search/columns";
import { SearchLocation } from "@app/components/spaces/search/SearchingInSpace";
import type { SpaceSearchContextType } from "@app/components/spaces/search/SpaceSearchContext";
import { SpaceSearchContext } from "@app/components/spaces/search/SpaceSearchContext";
import { SpacePageHeader } from "@app/components/spaces/SpacePageHeaders";
import { useCursorPaginationForDataTable } from "@app/hooks/useCursorPaginationForDataTable";
import { useDebounce } from "@app/hooks/useDebounce";
import { useQueryParams } from "@app/hooks/useQueryParams";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import { useDataSourceViews } from "@app/lib/swr/data_source_views";
import { useSpaces, useSpaceSearch } from "@app/lib/swr/spaces";
import type {
  APIError,
  ContentNodesViewType,
  DataSourceViewCategory,
  DataSourceViewContentNode,
  DataSourceViewType,
  LightContentNode,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types";
import { DATA_SOURCE_MIME_TYPE } from "@dust-tt/client";

const DEFAULT_VIEW_TYPE = "all";

interface BaseSpaceSearchInputProps {
  canReadInSpace: boolean;
  canWriteInSpace: boolean;
  children: React.ReactNode;
  owner: LightWorkspaceType;
  dataSourceView: DataSourceViewType | undefined;
  space: SpaceType;
  parentId: string | undefined;
  category: DataSourceViewCategory | undefined;
}

interface BackendSearchProps extends BaseSpaceSearchInputProps {
  useBackendSearch: true;
}

interface FrontendSearchProps extends BaseSpaceSearchInputProps {
  useBackendSearch?: false;
}

// Use discriminated union to ensure proper type narrowing.
type SpaceSearchInputProps = BackendSearchProps | FrontendSearchProps;

// Add this function to check if we're in backend search mode.
function isBackendSearch(
  props: SpaceSearchInputProps
): props is BackendSearchProps {
  return props.useBackendSearch === true;
}

export function SpaceSearchInput(props: SpaceSearchInputProps) {
  // Common code for both backend and frontend search.
  const [isSearchDisabled, setIsSearchDisabled] =
    React.useState<boolean>(false);
  const [targetDataSourceViews, setTargetDataSourceViews] = React.useState<
    DataSourceViewType[]
  >(props.dataSourceView ? [props.dataSourceView] : []);
  const [actionButtons, setActionButtons] =
    React.useState<React.ReactNode | null>(null);

  const router = useRouter();

  // Reset the search term when the URL changes.
  React.useEffect(() => {
    setTargetDataSourceViews(
      props.dataSourceView ? [props.dataSourceView] : []
    );
  }, [props.dataSourceView, router.asPath]);

  const [viewType] = useHashParam("viewType", DEFAULT_VIEW_TYPE) as [
    ContentNodesViewType,
    (viewType: ContentNodesViewType) => void,
  ];

  // Create the context value.
  const searchContextValue = React.useMemo(
    () => ({
      isSearchDisabled,
      setIsSearchDisabled,
      targetDataSourceViews,
      setTargetDataSourceViews,
      setActionButtons,
      actionButtons,
    }),
    [isSearchDisabled, targetDataSourceViews, actionButtons]
  );

  // Use the type guard to narrow the type.
  const isBackend = isBackendSearch(props);

  // Render based on props type.
  if (isBackend) {
    // This branch handles BackendSearchProps
    return (
      <BackendSearch
        {...props}
        isSearchDisabled={isSearchDisabled}
        targetDataSourceViews={targetDataSourceViews}
        searchContextValue={searchContextValue}
        viewType={viewType}
      />
    );
  } else {
    // This branch handles FrontendSearchProps
    return (
      <>
        <FrontendSearch
          {...props}
          isSearchDisabled={isSearchDisabled}
          searchContextValue={searchContextValue}
        />
      </>
    );
  }
}

interface FullBackendSearchProps extends BackendSearchProps {
  isSearchDisabled: boolean;
  searchContextValue: SpaceSearchContextType;
  targetDataSourceViews: DataSourceViewType[];
  viewType: ContentNodesViewType;
  space: SpaceType;
}

const PAGE_SIZE = 25;

function BackendSearch({
  canReadInSpace,
  canWriteInSpace,
  category,
  children,
  isSearchDisabled,
  owner,
  searchContextValue,
  targetDataSourceViews,
  viewType,
  space,
  dataSourceView,
  parentId,
}: FullBackendSearchProps) {
  const { q: searchParam } = useQueryParams(["q"]);

  const [searchResultDataSourceView, setSearchResultDataSourceView] =
    React.useState<DataSourceViewType | null>(null);
  const [effectiveContentNode, setEffectiveContentNode] =
    React.useState<LightContentNode | null>(null);
  const effectiveDataSourceView = dataSourceView || searchResultDataSourceView;

  const handleOpenDocument = React.useCallback(
    (node: DataSourceViewContentNode) => {
      setSearchResultDataSourceView(node.dataSourceView);
    },
    []
  );
  const handleCloseModal = React.useCallback(() => {
    setSearchResultDataSourceView(null);
    setEffectiveContentNode(null);
  }, []);

  const [searchResults, setSearchResults] = React.useState<
    DataSourceViewContentNode[]
  >([]);

  const {
    inputValue: searchTerm,
    debouncedValue: debouncedSearch,
    isDebouncing,
    setValue: setSearchValue,
  } = useDebounce(searchParam.value || "", {
    delay: 300,
    minLength: MIN_SEARCH_QUERY_SIZE,
  });

  const handleSearchChange = (value: string) => {
    searchParam.setParam(value);
    setSearchValue(value);
  };

  const shouldShowSearchResults = debouncedSearch.length > 0;

  const [isChanging, setIsChanging] = React.useState(false);
  const [showSearch, setShowSearch] = React.useState(shouldShowSearchResults);
  const [searchHitCount, setSearchHitCount] = React.useState(0);

  const {
    cursorPagination,
    resetPagination,
    handlePaginationChange,
    tablePagination,
  } = useCursorPaginationForDataTable(PAGE_SIZE);

  // Reset pagination when debounced search changes
  React.useEffect(() => {
    resetPagination();
  }, [debouncedSearch, resetPagination]);

  // Use the space search hook for backend search
  const {
    isSearchLoading,
    isSearchValidating,
    searchResultNodes,
    total: totalNodesCount,
    nextPageCursor,
  } = useSpaceSearch({
    dataSourceViews: targetDataSourceViews,
    disabled: !debouncedSearch,
    includeDataSources: true,
    pagination: { cursor: cursorPagination.cursor, limit: PAGE_SIZE },
    owner,
    search: debouncedSearch,
    space,
    viewType,
  });

  const isLoading = isDebouncing || isSearchLoading || isSearchValidating;

  React.useEffect(() => {
    if (tablePagination.pageIndex === 0) {
      // Replace results on new search (first page)
      setSearchResults(searchResultNodes);
    } else if (searchResultNodes.length > 0) {
      // Append results for subsequent pages
      setSearchResults((prev) => [...prev, ...searchResultNodes]);
    }
  }, [searchResultNodes, tablePagination.pageIndex]);

  const handleLoadMore = React.useCallback(() => {
    if (nextPageCursor && !isSearchValidating) {
      handlePaginationChange(
        {
          pageIndex: tablePagination.pageIndex + 1,
          pageSize: PAGE_SIZE,
        },
        nextPageCursor
      );
    }
  }, [
    nextPageCursor,
    isSearchValidating,
    handlePaginationChange,
    tablePagination.pageIndex,
  ]);

  // Handle transition when search state changes
  React.useEffect(() => {
    if (shouldShowSearchResults !== showSearch) {
      setIsChanging(true);
      const timer = setTimeout(() => {
        setShowSearch(shouldShowSearchResults);
        // Small delay to start fade-in after content change.
        setTimeout(() => setIsChanging(false), 50);
      }, 150);

      return () => clearTimeout(timer);
    }
  }, [shouldShowSearchResults, showSearch]);

  React.useEffect(() => {
    if (totalNodesCount !== undefined && !isSearchValidating && !isLoading) {
      setSearchHitCount(totalNodesCount);
    }
  }, [isLoading, isSearchValidating, totalNodesCount]);
  return (
    <SpaceSearchContext.Provider value={searchContextValue}>
      <SearchInput
        name="search"
        placeholder="Search (Name)"
        value={searchTerm}
        onChange={handleSearchChange}
        disabled={isSearchDisabled}
      />

      <div
        className={cn(
          "transition-opacity duration-150",
          isChanging && "opacity-0"
        )}
      >
        {showSearch ? (
          <SearchLocation
            category={category}
            dataSourceViews={
              dataSourceView ? [dataSourceView] : targetDataSourceViews
            }
            space={space}
          />
        ) : (
          <SpacePageHeader
            owner={owner}
            space={space}
            category={category}
            dataSourceView={dataSourceView}
            parentId={parentId}
          />
        )}
      </div>

      <div
        className={cn(
          "transform transition-all duration-150",
          isChanging && "translate-y-1 opacity-0"
        )}
      >
        {showSearch ? (
          <div className="flex w-full flex-col gap-2">
            <div className="text-end text-sm text-muted-foreground">
              Showing {searchResults.length} of {searchHitCount} results
            </div>
            <SearchResultsTable
              searchResultNodes={searchResults}
              category={category}
              isSearchValidating={isSearchValidating}
              owner={owner}
              totalNodesCount={searchHitCount}
              canReadInSpace={canReadInSpace}
              canWriteInSpace={canWriteInSpace}
              onLoadMore={handleLoadMore}
              isLoading={isSearchLoading}
              onOpenDocument={handleOpenDocument}
              setEffectiveContentNode={setEffectiveContentNode}
            />
          </div>
        ) : (
          children
        )}
      </div>
      <DataSourceViewDocumentModal
        owner={owner}
        dataSourceView={effectiveDataSourceView}
        onClose={handleCloseModal}
      />
      <DocumentOrTableDeleteDialog
        dataSourceView={effectiveDataSourceView}
        contentNode={effectiveContentNode}
        owner={owner}
      />
    </SpaceSearchContext.Provider>
  );
}

interface FullFrontendSearchProps extends FrontendSearchProps {
  isSearchDisabled: boolean;
  searchContextValue: SpaceSearchContextType;
}

function FrontendSearch({
  children,
  isSearchDisabled,
  searchContextValue,
  space,
  category,
  owner,
  dataSourceView,
  parentId,
}: FullFrontendSearchProps) {
  const { q: searchParam } = useQueryParams(["q"]);
  const searchTerm = searchParam.value || "";

  return (
    <SpaceSearchContext.Provider value={searchContextValue}>
      <SearchInput
        name="search"
        placeholder="Search (Name)"
        value={searchTerm}
        onChange={searchParam.setParam}
        disabled={isSearchDisabled}
      />
      <div className="flex w-full justify-between gap-2">
        <SpacePageHeader
          owner={owner}
          space={space}
          category={category}
          dataSourceView={dataSourceView}
          parentId={parentId}
        />
      </div>

      {children}
    </SpaceSearchContext.Provider>
  );
}

const ROWS_COUNT_CAPPED = 1000;

type RowData = DataSourceViewContentNode & {
  icon: React.ComponentType;
  onClick?: () => void;
  menuItems?: MenuItem[];
};

const columnsBreakpoints = {
  lastUpdatedAt: "sm" as const,
  spaces: "md" as const,
};

interface SearchResultsTableProps {
  canReadInSpace: boolean;
  canWriteInSpace: boolean;
  category: DataSourceViewCategory | undefined;
  isSearchValidating: boolean;
  owner: LightWorkspaceType;
  searchResultNodes: DataSourceViewContentNode[];
  totalNodesCount: number;
  onLoadMore: () => void;
  isLoading: boolean;
  onOpenDocument?: (node: DataSourceViewContentNode) => void;
  setEffectiveContentNode: (node: DataSourceViewContentNode) => void;
}

function SearchResultsTable({
  canReadInSpace,
  canWriteInSpace,
  category,
  isSearchValidating,
  owner,
  searchResultNodes,
  totalNodesCount,
  onLoadMore,
  isLoading,
  onOpenDocument,
  setEffectiveContentNode,
}: SearchResultsTableProps) {
  const router = useRouter();

  const { spaces } = useSpaces({
    workspaceId: owner.sId,
  });

  const { dataSourceViews, mutateDataSourceViews } = useDataSourceViews(owner);

  const sendNotification = useSendNotification();

  const contentActionsRef = React.useRef<ContentActionsRef>(null);

  const addToSpace = React.useCallback(
    async (node: DataSourceViewContentNode, spaceId: string) => {
      const existingViewForSpace = dataSourceViews.find(
        (d) => d.spaceId === spaceId && d.sId === node.dataSourceView.sId
      );

      try {
        let res;
        if (existingViewForSpace) {
          res = await fetch(
            `/api/w/${owner.sId}/spaces/${spaceId}/data_source_views/${existingViewForSpace.sId}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                parentsToAdd: [node.internalId],
              }),
            }
          );
        } else {
          res = await fetch(
            `/api/w/${owner.sId}/spaces/${spaceId}/data_source_views`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                dataSourceId: node.dataSourceView.dataSource.sId,
                parentsIn: [node.internalId],
              }),
            }
          );
        }

        if (!res.ok) {
          const rawError: { error: APIError } = await res.json();
          sendNotification({
            title: "Error while adding data to space",
            description: rawError.error.message,
            type: "error",
          });
        } else {
          sendNotification({
            title: "Data added to space",
            type: "success",
          });
          await mutateDataSourceViews();
        }
      } catch (e) {
        sendNotification({
          title: "Error while adding data to space",
          description: `An Unknown error ${e} occurred while adding data to space.`,
          type: "error",
        });
      }
    },
    [dataSourceViews, mutateDataSourceViews, owner.sId, sendNotification]
  );

  // Transform search results into format for DataTable.
  const rows: RowData[] = React.useMemo(() => {
    return searchResultNodes.map((node) => {
      const { dataSourceView, internalId: parentId } = node;

      return {
        ...node,
        id: node.internalId,
        icon: getVisualForDataSourceViewContentNode(node),
        ...(node.expandable && {
          onClick: () => {
            if (node.expandable) {
              const baseUrl = `/w/${owner.sId}/spaces/${node.dataSourceView.spaceId}/categories/${category ?? node.dataSourceView.category}/data_source_views/${dataSourceView.sId}`;
              // If the node is a data source, we don't need to pass the parentId.
              const url =
                node.mimeType === DATA_SOURCE_MIME_TYPE
                  ? baseUrl
                  : `${baseUrl}?parentId=${parentId}`;

              void router.push(url);
            }
          },
        }),
        location: getLocationForDataSourceViewContentNode(node),
        menuItems: getMenuItems(
          canReadInSpace,
          canWriteInSpace,
          dataSourceView,
          node,
          contentActionsRef,
          spaces,
          dataSourceViews,
          addToSpace,
          router,
          onOpenDocument,
          setEffectiveContentNode
        ),
      };
    });
  }, [
    addToSpace,
    canReadInSpace,
    canWriteInSpace,
    category,
    dataSourceViews,
    onOpenDocument,
    owner.sId,
    router,
    searchResultNodes,
    setEffectiveContentNode,
    spaces,
  ]);

  return (
    <ScrollableDataTable
      data={rows}
      columns={makeColumnsForSearchResults()}
      className={cn(
        "pb-4",
        isSearchValidating && "pointer-events-none opacity-50"
      )}
      // TODO(20250226, search-kb): support server side pagination.
      totalRowCount={totalNodesCount}
      rowCountIsCapped={totalNodesCount === ROWS_COUNT_CAPPED}
      columnsBreakpoints={columnsBreakpoints}
      // TODO(20250304 jules): take full page height instead
      maxHeight="h-[800px]"
      onLoadMore={onLoadMore}
      isLoading={isLoading}
    />
  );
}
