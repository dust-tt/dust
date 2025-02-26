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
  DataSourceViewCategoryWithoutApps,
  DataSourceViewContentNode,
  DataSourceViewType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { MIN_SEARCH_QUERY_SIZE } from "@dust-tt/types";
import type { SortingState } from "@tanstack/react-table";
import { useRouter } from "next/router";
import React from "react";

import type { ContentActionsRef } from "@app/components/spaces/ContentActions";
import { getMenuItems } from "@app/components/spaces/ContentActions";
import { makeColumnsForSearchResults } from "@app/components/spaces/search/columns";
import type { SpaceSearchContextType } from "@app/components/spaces/SpaceSearchContext";
import { SpaceSearchContext } from "@app/components/spaces/SpaceSearchContext";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import { useDataSourceViews } from "@app/lib/swr/data_source_views";
import { useSpaces, useSpaceSearch } from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";

export const ACTION_BUTTONS_CONTAINER_ID = "space-action-buttons-container";

const DEFAULT_VIEW_TYPE = "all";

interface BaseSpaceSearchInputProps {
  canReadInSpace: boolean;
  canWriteInSpace: boolean;
  children: React.ReactNode;
  owner: LightWorkspaceType;
}

interface BackendSearchProps extends BaseSpaceSearchInputProps {
  useBackendSearch: true;
  category: DataSourceViewCategoryWithoutApps;
}

interface FrontendSearchProps extends BaseSpaceSearchInputProps {
  useBackendSearch?: false;
  category: DataSourceViewCategory | undefined;
}

// Use discriminated union to ensure proper type narrowing
type SpaceSearchInputProps = BackendSearchProps | FrontendSearchProps;

// Add this function to check if we're in backend search mode
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
  >([]);
  const [actionButtons, setActionButtons] =
    React.useState<React.ReactNode | null>(null);

  const { owner } = props;

  // Get feature flags.
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });
  const hasSearchKnowledgeBuilderFF = featureFlags.includes(
    "search_knowledge_builder"
  );

  const router = useRouter();

  // Reset the search term when the URL changes.
  React.useEffect(() => {
    setSearchTerm("");
  }, [router.asPath]);

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
        hasSearchKnowledgeBuilderFF={hasSearchKnowledgeBuilderFF}
      />
    );
  } else {
    // This branch handles FrontendSearchProps
    return (
      <FrontendSearch
        {...props}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        isSearchDisabled={isSearchDisabled}
        searchContextValue={searchContextValue}
      />
    );
  }
}

interface FullBackendSearchProps extends BackendSearchProps {
  hasSearchKnowledgeBuilderFF: boolean;
  isSearchDisabled: boolean;
  searchContextValue: SpaceSearchContextType;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  targetDataSourceViews: DataSourceViewType[];
  viewType: ContentNodesViewType;
}

function BackendSearch({
  canReadInSpace,
  canWriteInSpace,
  category,
  children,
  hasSearchKnowledgeBuilderFF,
  isSearchDisabled,
  owner,
  searchContextValue,
  searchTerm,
  setSearchTerm,
  targetDataSourceViews,
  viewType,
}: FullBackendSearchProps) {
  // For backend search, we need to debounce the search term.
  const [debouncedSearch, setDebouncedSearch] = React.useState<string>("");

  // Debounce search term for backend search.
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (hasSearchKnowledgeBuilderFF) {
        setDebouncedSearch(
          searchTerm.length >= MIN_SEARCH_QUERY_SIZE ? searchTerm : ""
        );
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [searchTerm, hasSearchKnowledgeBuilderFF]);

  // Use the space search hook for backend search.
  const {
    searchResultNodes,
    isSearchLoading,
    isSearchValidating,
    total: totalNodesCount,
  } = useSpaceSearch({
    dataSourceViews: targetDataSourceViews,
    includeDataSources: false,
    owner,
    search: debouncedSearch,
    viewType,
    disabled: !hasSearchKnowledgeBuilderFF || !debouncedSearch,
  });

  // Determine whether to show search results or children.
  const shouldShowSearchResults =
    hasSearchKnowledgeBuilderFF && debouncedSearch.length > 0;

  return (
    <SpaceSearchContext.Provider value={searchContextValue}>
      <div className="mb-4">
        <div className="flex w-full gap-2">
          <SearchInput
            name="search"
            placeholder="Search (Name)"
            value={searchTerm}
            onChange={setSearchTerm}
            disabled={isSearchDisabled}
          />
          <div id={ACTION_BUTTONS_CONTAINER_ID} className="flex gap-2" />
        </div>
      </div>

      {shouldShowSearchResults ? (
        <div className="mt-4">
          <h2 className="mb-2 text-lg font-medium">
            Search results for "{debouncedSearch}"
          </h2>
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
}: FullFrontendSearchProps) {
  return (
    <SpaceSearchContext.Provider value={searchContextValue}>
      <div className="mb-4">
        <div className="flex w-full gap-2">
          <SearchInput
            name="search"
            placeholder="Search (Name)"
            value={searchTerm}
            onChange={setSearchTerm}
            disabled={isSearchDisabled}
          />
          <div id={ACTION_BUTTONS_CONTAINER_ID} className="flex gap-2" />
        </div>
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
  category: DataSourceViewCategoryWithoutApps;
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
  const [sorting, setSorting] = React.useState<SortingState>([]);

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
              void router.push(
                `/w/${owner.sId}/spaces/${node.dataSourceView.spaceId}/categories/${category}/data_source_views/${dataSourceView.sId}?parentId=${parentId}`
              );
            }
          },
        }),
        dropdownMenuProps: {
          modal: false,
        },
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

  // TODO: Handle no results found.

  return (
    <DataTable
      data={rows}
      columns={makeColumnsForSearchResults()}
      filter={undefined}
      filterColumn={"title"}
      className={cn(
        "pb-4",
        isSearchValidating && "pointer-events-none opacity-50"
      )}
      sorting={sorting}
      setSorting={setSorting}
      // TODO(20250226, search-kb): support server side pagination.
      totalRowCount={totalNodesCount}
      rowCountIsCapped={totalNodesCount === ROWS_COUNT_CAPPED}
      columnsBreakpoints={columnsBreakpoints}
    />
  );
}

export function SpacePageWrapper({
  children,
  actionButtons,
  isEmpty,
}: {
  children: React.ReactNode;
  actionButtons: React.ReactNode;
  isEmpty: boolean;
}) {
  const { searchTerm, setSearchTerm } = React.useContext(SpaceSearchContext);

  return (
    <>
      {/* Search bar with conditional action buttons */}
      <div className="mb-4 flex gap-2">
        <div className="flex-grow">
          <SearchInput
            name="search"
            placeholder="Search (Name)"
            value={searchTerm}
            onChange={setSearchTerm}
          />
        </div>
        {/* Show buttons in header only if not empty */}
        {!isEmpty && <div className="flex gap-2">{actionButtons}</div>}
      </div>

      {/* Main content */}
      {isEmpty ? (
        <div className="flex h-36 w-full items-center justify-center rounded-xl bg-muted-background">
          {/* Show buttons in center when empty */}
          {actionButtons}
        </div>
      ) : (
        children
      )}
    </>
  );
}
