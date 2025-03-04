import type { MenuItem } from "@dust-tt/sparkle";
import {
  cn,
  DataTable,
  SearchInput,
  Spinner,
  useHashParam,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  APIError,
  ContentNodesViewType,
  DataSourceViewCategory,
  DataSourceViewContentNode,
  DataSourceViewType,
  LightWorkspaceType,
  SpaceType,
} from "@dust-tt/types";
import { MIN_SEARCH_QUERY_SIZE } from "@dust-tt/types";
import { useRouter } from "next/router";
import React from "react";

import type { ContentActionsRef } from "@app/components/spaces/ContentActions";
import { getMenuItems } from "@app/components/spaces/ContentActions";
import { makeColumnsForSearchResults } from "@app/components/spaces/search/columns";
import { SearchLocation } from "@app/components/spaces/search/SearchingInSpace";
import type { SpaceSearchContextType } from "@app/components/spaces/search/SpaceSearchContext";
import { SpaceSearchContext } from "@app/components/spaces/search/SpaceSearchContext";
import { SpacePageHeader } from "@app/components/spaces/SpacePageHeaders";
import {
  DATA_SOURCE_MIME_TYPE,
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import { useDataSourceViews } from "@app/lib/swr/data_source_views";
import { useSpaces, useSpaceSearch } from "@app/lib/swr/spaces";

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
  const [searchTerm, setSearchTerm] = React.useState<string>("");
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
    setSearchTerm("");
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
      searchTerm,
      setSearchTerm,
      isSearchDisabled,
      setIsSearchDisabled,
      targetDataSourceViews,
      setTargetDataSourceViews,
      setActionButtons,
      actionButtons,
    }),
    [searchTerm, isSearchDisabled, targetDataSourceViews, actionButtons]
  );

  // Use the type guard to narrow the type.
  const isBackend = isBackendSearch(props);

  // Render based on props type.
  if (isBackend) {
    // This branch handles BackendSearchProps
    return (
      <BackendSearch
        {...props}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
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
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
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
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  targetDataSourceViews: DataSourceViewType[];
  viewType: ContentNodesViewType;
  space: SpaceType;
}

function BackendSearch({
  canReadInSpace,
  canWriteInSpace,
  category,
  children,
  isSearchDisabled,
  owner,
  searchContextValue,
  searchTerm,
  setSearchTerm,
  targetDataSourceViews,
  viewType,
  space,
  dataSourceView,
  parentId,
}: FullBackendSearchProps) {
  // For backend search, we need to debounce the search term.
  const [debouncedSearch, setDebouncedSearch] = React.useState<string>("");

  // Determine whether to show search results or children.
  const shouldShowSearchResults = debouncedSearch.length > 0;

  // Transition state.
  const [isChanging, setIsChanging] = React.useState(false);
  const [showSearch, setShowSearch] = React.useState(shouldShowSearchResults);

  // Debounce search term for backend search.
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(
        searchTerm.length >= MIN_SEARCH_QUERY_SIZE ? searchTerm : ""
      );
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [searchTerm]);

  // Use the space search hook for backend search.
  const {
    isSearchLoading,
    isSearchValidating,
    searchResultNodes,
    total: totalNodesCount,
  } = useSpaceSearch({
    dataSourceViews: targetDataSourceViews,
    disabled: !debouncedSearch,
    includeDataSources: true,
    owner,
    search: debouncedSearch,
    space,
    viewType,
  });

  // Handle transition when search state changes.
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

  return (
    <SpaceSearchContext.Provider value={searchContextValue}>
      <SearchInput
        name="search"
        placeholder="Search (Name)"
        value={searchTerm}
        onChange={setSearchTerm}
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
          <div>
            {isSearchLoading ? (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            ) : searchResultNodes.length > 0 ? (
              <SearchResultsTable
                searchResultNodes={searchResultNodes}
                category={category}
                isSearchValidating={isSearchValidating}
                owner={owner}
                totalNodesCount={totalNodesCount}
                canReadInSpace={canReadInSpace}
                canWriteInSpace={canWriteInSpace}
              />
            ) : (
              <div className="py-4 text-muted-foreground">
                No results found for "{debouncedSearch}"
              </div>
            )}
          </div>
        ) : (
          children
        )}
      </div>
    </SpaceSearchContext.Provider>
  );
}

interface FullFrontendSearchProps extends FrontendSearchProps {
  isSearchDisabled: boolean;
  searchContextValue: SpaceSearchContextType;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

function FrontendSearch({
  children,
  isSearchDisabled,
  searchContextValue,
  searchTerm,
  setSearchTerm,
  space,
  category,
  owner,
  dataSourceView,
  parentId,
}: FullFrontendSearchProps) {
  return (
    <SpaceSearchContext.Provider value={searchContextValue}>
      <SearchInput
        name="search"
        placeholder="Search (Name)"
        value={searchTerm}
        onChange={setSearchTerm}
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
}

function SearchResultsTable({
  canReadInSpace,
  canWriteInSpace,
  category,
  isSearchValidating,
  owner,
  searchResultNodes,
  totalNodesCount,
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
        dropdownMenuProps: {
          modal: false,
        },
        location: getLocationForDataSourceViewContentNode(node),
        menuItems: getMenuItems(
          canReadInSpace,
          canWriteInSpace,
          dataSourceView,
          node,
          contentActionsRef,
          spaces,
          dataSourceViews,
          addToSpace
        ),
      };
    });
  }, [
    addToSpace,
    canReadInSpace,
    canWriteInSpace,
    category,
    contentActionsRef,
    dataSourceViews,
    owner.sId,
    router,
    searchResultNodes,
    spaces,
  ]);

  return (
    <DataTable
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
    />
  );
}
