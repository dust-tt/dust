// All mime types are okay to use from the public API.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { DATA_SOURCE_MIME_TYPE } from "@dust-tt/client";
import type { MenuItem } from "@dust-tt/sparkle";
import { cn, ScrollableDataTable, SearchInput } from "@dust-tt/sparkle";
import type { SortingState } from "@tanstack/table-core";
import { useRouter } from "next/router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { DocumentOrTableDeleteDialog } from "@app/components/data_source/DocumentOrTableDeleteDialog";
import DataSourceViewDocumentModal from "@app/components/DataSourceViewDocumentModal";
import type { ContentActionsRef } from "@app/components/spaces/ContentActions";
import { getMenuItems } from "@app/components/spaces/ContentActions";
import {
  makeColumnsForSearchResults,
  SORTING_KEYS,
} from "@app/components/spaces/search/columns";
import { SearchLocation } from "@app/components/spaces/search/SearchingInSpace";
import type { SpaceSearchContextType } from "@app/components/spaces/search/SpaceSearchContext";
import { SpaceSearchContext } from "@app/components/spaces/search/SpaceSearchContext";
import { SpacePageHeader } from "@app/components/spaces/SpacePageHeaders";
import { useCursorPaginationForDataTable } from "@app/hooks/useCursorPaginationForDataTable";
import { useDebounce } from "@app/hooks/useDebounce";
import { useHashParam } from "@app/hooks/useHashParams";
import { useSendNotification } from "@app/hooks/useNotification";
import { useQueryParams } from "@app/hooks/useQueryParams";
import type { SortingParams } from "@app/lib/api/pagination";
import type { NodeCandidate, UrlCandidate } from "@app/lib/connectors";
import {
  getViewTypeForURLNodeCandidateAccountingForNotion,
  isNodeCandidate,
  isUrlCandidate,
  nodeCandidateFromUrl,
} from "@app/lib/connectors";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import { useDataSourceViews } from "@app/lib/swr/data_source_views";
import { useSpaces, useSpacesSearch } from "@app/lib/swr/spaces";
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
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const effectiveDataSourceView = dataSourceView || searchResultDataSourceView;
  const [nodeOrUrlCandidate, setNodeOrUrlCandidate] = React.useState<
    UrlCandidate | NodeCandidate | null
  >(null);

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
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  } = useDebounce(searchParam.value || "", {
    delay: 300,
    minLength: MIN_SEARCH_QUERY_SIZE,
  });

  const handleClearSearch = React.useCallback(() => {
    searchParam.setParam(undefined);
    setSearchValue("");
    setNodeOrUrlCandidate(null);
  }, [searchParam, setSearchValue]);

  const handleSearchChange = (value: string) => {
    searchParam.setParam(value);
    setSearchValue(value);
  };

  // Check if the search term is a URL
  React.useEffect(() => {
    if (debouncedSearch.length >= MIN_SEARCH_QUERY_SIZE) {
      const candidate = nodeCandidateFromUrl(debouncedSearch.trim());
      setNodeOrUrlCandidate(candidate);
    } else {
      setNodeOrUrlCandidate(null);
    }
  }, [debouncedSearch]);

  const shouldShowSearchResults = debouncedSearch.length > 0;

  const [isChanging, setIsChanging] = React.useState(false);
  const [showSearch, setShowSearch] = React.useState(shouldShowSearchResults);
  const [searchHitCount, setSearchHitCount] = React.useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);
  const scrollableDataTableRef = useRef<HTMLDivElement>(null);

  const {
    cursorPagination,
    resetPagination,
    handlePaginationChange,
    tablePagination,
  } = useCursorPaginationForDataTable(PAGE_SIZE);

  // Reset pagination when debounced search changes
  React.useEffect(() => {
    resetPagination();
    if (scrollableDataTableRef.current) {
      scrollableDataTableRef.current.scrollTo({
        top: 0,
      });
    }
  }, [debouncedSearch, resetPagination, sorting]);

  const handleSortingChange = useCallback(
    (sorting: SortingState) => {
      resetPagination();
      setSorting(sorting);
    },
    [resetPagination, setSorting]
  );

  const commonSearchParams = {
    owner,
    spaceIds: [space.sId],
    pagination: { cursor: cursorPagination.cursor, limit: PAGE_SIZE },
    // Required by search API to allow admins to search the system space
    allowAdminSearch: true,
    disabled: !debouncedSearch,
    dataSourceViewIdsBySpaceId:
      targetDataSourceViews.length > 0
        ? {
            [space.sId]: targetDataSourceViews.map((dsv) => dsv.sId),
          }
        : undefined,
  };

  const searchSort: SortingParams = useMemo(
    () =>
      sorting
        .filter((sort) => SORTING_KEYS[sort.id])
        .map((sort) => ({
          field: SORTING_KEYS[sort.id],
          direction: sort.desc ? "desc" : "asc",
        })),
    [sorting]
  );

  // Use the spaces search hook for backend search with URL/node support
  const {
    isSearchLoading,
    isSearchValidating,
    searchResultNodes,
    nextPageCursor,
  } = useSpacesSearch(
    isNodeCandidate(nodeOrUrlCandidate) && nodeOrUrlCandidate.node
      ? {
          ...commonSearchParams,
          nodeIds: [nodeOrUrlCandidate.node],
          includeDataSources: false,
          viewType: getViewTypeForURLNodeCandidateAccountingForNotion(
            viewType,
            nodeOrUrlCandidate.node
          ),
          searchSort,
        }
      : {
          ...commonSearchParams,
          search: debouncedSearch,
          searchSourceUrls: isUrlCandidate(nodeOrUrlCandidate),
          includeDataSources: true,
          viewType,
          searchSort,
        }
  );

  const isLoading = isDebouncing || isSearchLoading || isSearchValidating;

  React.useEffect(() => {
    // Process search results to convert them to DataSourceViewContentNode format
    const processedResults = searchResultNodes.flatMap((node) => {
      const { dataSourceViews, ...rest } = node;
      return dataSourceViews.map((view) => ({
        ...rest,
        dataSourceView: view,
      }));
    });

    // Filter results based on URL match if we have a URL candidate
    const filteredResults =
      nodeOrUrlCandidate && !isNodeCandidate(nodeOrUrlCandidate)
        ? processedResults.filter(
            (node) => node.sourceUrl === nodeOrUrlCandidate.url
          )
        : processedResults;

    if (tablePagination.pageIndex === 0) {
      // Replace results on new search (first page)
      setSearchResults(filteredResults);
    } else if (filteredResults.length > 0) {
      // Append results for subsequent pages
      setSearchResults((prev) => [...prev, ...filteredResults]);
    }
  }, [searchResultNodes, tablePagination.pageIndex, nodeOrUrlCandidate]);

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
    if (!isSearchValidating && !isLoading) {
      setSearchHitCount(searchResults.length);
    }
  }, [isLoading, isSearchValidating, searchResults]);
  return (
    <SpaceSearchContext.Provider value={searchContextValue}>
      <SearchInput
        name="search"
        placeholder={`Search in ${space.name}`}
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
              onClearSearch={handleClearSearch}
              sorting={sorting}
              setSorting={handleSortingChange}
              scrollableDataTableRef={scrollableDataTableRef}
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
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const searchTerm = searchParam.value || "";

  return (
    <SpaceSearchContext.Provider value={searchContextValue}>
      <SearchInput
        name="search"
        placeholder={`Search in ${space.name}`}
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
  sorting: SortingState;
  setSorting: (sorting: SortingState) => void;
  onLoadMore: () => void;
  isLoading: boolean;
  onOpenDocument?: (node: DataSourceViewContentNode) => void;
  setEffectiveContentNode: (node: DataSourceViewContentNode) => void;
  onClearSearch: () => void;
  scrollableDataTableRef: React.Ref<HTMLDivElement>;
}

function SearchResultsTable({
  canReadInSpace,
  canWriteInSpace,
  category,
  isSearchValidating,
  owner,
  searchResultNodes,
  totalNodesCount,
  sorting,
  setSorting,
  onLoadMore,
  isLoading,
  onOpenDocument,
  setEffectiveContentNode,
  onClearSearch,
  scrollableDataTableRef,
}: SearchResultsTableProps) {
  const router = useRouter();

  const { spaces } = useSpaces({
    workspaceId: owner.sId,
  });

  const { dataSourceViews, mutateDataSourceViews } = useDataSourceViews(owner);

  const sendNotification = useSendNotification();

  // `contentActionsRef` is always null in a search context as results are pulled across data
  // sources views. We still create the ref to comply to the API of getMenuItems.
  const contentActionsRef = React.useRef<ContentActionsRef>(null);

  const addToSpace = React.useCallback(
    async (node: DataSourceViewContentNode, spaceId: string) => {
      const existingViewForSpace = dataSourceViews.find(
        (d) =>
          d.spaceId === spaceId &&
          d.dataSource.sId === node.dataSourceView.dataSource.sId
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
              onClearSearch();
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
    onClearSearch,
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
      containerRef={scrollableDataTableRef}
      data={rows}
      sorting={sorting}
      setSorting={setSorting}
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
