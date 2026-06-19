// All mime types are okay to use from the public API.

import type {
  ContentNodeTreeItemStatus,
  TreeSelectionModelUpdater,
} from "@app/components/ContentNodeTree";
import { ContentNodeTree } from "@app/components/ContentNodeTree";
import type { SearchResultsLayoutParts } from "@app/components/data_source_view/DataSourceSelectionSearchResults";
import { DataSourceSelectionSearchResults } from "@app/components/data_source_view/DataSourceSelectionSearchResults";
import {
  deselectDescendants,
  getItemSelectionState,
  isItemCheckboxDisabled,
  updateSelection,
} from "@app/components/data_source_view/update_selection";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useDebounce } from "@app/hooks/useDebounce";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import type { NodeCandidate, UrlCandidate } from "@app/lib/connectors";
import {
  nodeCandidateFromUrl,
  orderDatasourceViewByImportance,
} from "@app/lib/connectors";
import {
  canBeExpanded,
  getDisplayNameForDataSource,
  isFolder,
  isManaged,
  isRemoteDatabase,
  isWebsite,
} from "@app/lib/data_sources";
import { getDisplayTitleForDataSourceViewContentNode } from "@app/lib/providers/content_nodes_display";
import type { UseInfiniteContentNodes } from "@app/lib/swr/data_source_views";
import { useInfiniteDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types/core/utils";
import type {
  DataSourceViewContentNode,
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
} from "@app/types/data_source_view";
import { defaultSelectionConfiguration } from "@app/types/data_source_view";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  CheckDone01,
  CloudArrowLeftRight,
  Folder,
  Globe01,
  ScrollArea,
  SearchInput,
  SheetViewportProvider,
  Tree,
} from "@dust-tt/sparkle";
import omit from "lodash/omit";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ONLY_ONE_SPACE_PER_SELECTION = true;
const ITEMS_PER_PAGE = 100;

const getUseResourceHook =
  (
    owner: LightWorkspaceType,
    dataSourceView: DataSourceViewType,
    viewType: ContentNodesViewType,
    useContentNodes: UseInfiniteContentNodes
  ) =>
  (parentId: string | null) => {
    const {
      nodes,
      hasNextPage,
      loadMore,
      isNodesLoading,
      nodesError,
      totalNodesCount,
      totalNodesCountIsAccurate,
      isLoadingMore,
      nextPageCursor,
    } = useContentNodes({
      owner,
      dataSourceView,
      parentId: parentId ?? undefined,
      viewType,
      sorting: [{ field: "title", direction: "asc" }],
      pagination: { cursor: null, limit: ITEMS_PER_PAGE },
      swrOptions: {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      },
    });

    return {
      resources: nodes,
      totalResourceCount: totalNodesCount,
      isResourcesLoading: isNodesLoading,
      isResourcesError: !!nodesError,
      isResourcesTruncated: !totalNodesCountIsAccurate,
      nextPageCursor: hasNextPage ? nextPageCursor : null,
      loadMore,
      isLoadingMore: isLoadingMore && !isNodesLoading,
    };
  };

interface UseLazyLoadAllNodesOptions {
  owner: LightWorkspaceType;
  dataSourceView: DataSourceViewType;
  viewType: ContentNodesViewType;
  useContentNodes: UseInfiniteContentNodes;
  onComplete: (nodes: ReturnType<UseInfiniteContentNodes>["nodes"]) => void;
}

function useLazyLoadAllNodes({
  owner,
  dataSourceView,
  viewType,
  useContentNodes,
  onComplete,
}: UseLazyLoadAllNodesOptions) {
  const [triggered, setTriggered] = useState(false);

  const { nodes, hasNextPage, isLoadingMore, loadMore } = useContentNodes({
    owner,
    dataSourceView: triggered ? dataSourceView : undefined,
    viewType,
    pagination: { cursor: null, limit: ITEMS_PER_PAGE },
  });

  useEffect(() => {
    if (!triggered) {
      return;
    }
    if (hasNextPage && !isLoadingMore) {
      void loadMore();
      return;
    }
    if (!hasNextPage && !isLoadingMore && nodes.length > 0) {
      onComplete(nodes);
      setTriggered(false);
    }
  }, [triggered, hasNextPage, isLoadingMore, loadMore, nodes, onComplete]);

  return {
    trigger: () => setTriggered(true),
    reset: () => setTriggered(false),
    isLoading: triggered,
  };
}

const getNodesFromConfig = (
  selectionConfiguration: DataSourceViewSelectionConfiguration
) =>
  selectionConfiguration.selectedResources.reduce<
    Record<string, ContentNodeTreeItemStatus>
  >(
    (acc, r) => ({
      [r.internalId]: {
        isSelected: true,
        node: r,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        parents: r.parentInternalIds || [],
      },
      ...acc,
    }),
    {}
  );

const applySelectionConfigUpdate = ({
  prevState,
  dataSourceView,
  update,
  selectionMode,
  keepOnlyOneSpaceIfApplicable,
}: {
  prevState: DataSourceViewSelectionConfigurations;
  dataSourceView: DataSourceViewType;
  update: Partial<DataSourceViewSelectionConfiguration>;
  selectionMode: "checkbox" | "radio";
  keepOnlyOneSpaceIfApplicable: (
    config: DataSourceViewSelectionConfigurations
  ) => DataSourceViewSelectionConfigurations;
}): DataSourceViewSelectionConfigurations => {
  const { sId } = dataSourceView;
  const prevConfig =
    prevState[sId] ?? defaultSelectionConfiguration(dataSourceView);
  const updatedConfig = { ...prevConfig, ...update };

  if (selectionMode === "radio") {
    return { [sId]: updatedConfig };
  }

  return keepOnlyOneSpaceIfApplicable({
    ...prevState,
    [sId]: updatedConfig,
  });
};

export type useCaseDataSourceViewsSelector =
  | "spaceDatasourceManagement"
  | "assistantBuilder"
  | "transcriptsProcessing"
  | "trackerBuilder";

interface DataSourceViewsSelectorProps {
  owner: LightWorkspaceType;
  useCase: useCaseDataSourceViewsSelector;
  dataSourceViews: DataSourceViewType[];
  selectionConfigurations: DataSourceViewSelectionConfigurations;
  setSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
  viewType: ContentNodesViewType;
  isRootSelectable: boolean;
  space: SpaceType;
  selectionMode?: "checkbox" | "radio";
  allowAdminSearch?: boolean;
  useContentNodes?: UseInfiniteContentNodes;
  fixedSearchLayout?: boolean;
  focusSearchOnOpen?: boolean;
}

export function DataSourceViewsSelector({
  owner,
  useCase,
  dataSourceViews,
  selectionConfigurations,
  setSelectionConfigurations,
  viewType,
  isRootSelectable,
  space,
  selectionMode = "checkbox",
  allowAdminSearch = false,
  useContentNodes,
  fixedSearchLayout = false,
  focusSearchOnOpen = false,
}: DataSourceViewsSelectorProps) {
  const isMobile = useIsMobile();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    inputValue: searchSpaceText,
    debouncedValue: debouncedSearch,
    setValue: setSearchSpaceText,
  } = useDebounce("", {
    delay: 300,
    minLength: MIN_SEARCH_QUERY_SIZE,
  });
  const [nodeOrUrlCandidate, setNodeOrUrlCandidate] = useState<
    UrlCandidate | NodeCandidate | null
  >(null);

  const filteredDSVs = useMemo(() => {
    const includesConnectorIDs: string[] = [];
    const excludesConnectorIDs: string[] = [];

    // When selecting tables, for tables query all tables from a single warehouse
    // (either the same remoteDb or all from Dust SQLite).
    // The data_warehouse view type (for the warehouses tool server) allows multiple warehouses.
    if (viewType === "table" && useCase === "assistantBuilder") {
      const selection = Object.values(selectionConfigurations);
      const firstDs =
        selection.length > 0 ? selection[0].dataSourceView.dataSource : null;

      if (firstDs) {
        if (isRemoteDatabase(firstDs)) {
          includesConnectorIDs.push(firstDs.connectorId!);
        } else {
          dataSourceViews.forEach((dsv) => {
            if (isRemoteDatabase(dsv.dataSource)) {
              excludesConnectorIDs.push(dsv.dataSource.connectorId!);
            }
          });
        }
      }
    }

    return orderDatasourceViewByImportance(dataSourceViews).filter((dsv) => {
      const connectorId = dsv.dataSource.connectorId;
      if (!includesConnectorIDs.length && !excludesConnectorIDs.length) {
        return true;
      }
      if (includesConnectorIDs.length) {
        return connectorId ? includesConnectorIDs.includes(connectorId) : false;
      }
      if (excludesConnectorIDs.length && connectorId) {
        return !excludesConnectorIDs.includes(connectorId);
      }
      return true;
    });
  }, [dataSourceViews, selectionConfigurations, viewType, useCase]);

  // Group the filtered DSVs
  const filteredGroups = useMemo(
    () => ({
      managedDsv: filteredDSVs.filter((dsv) => isManaged(dsv.dataSource)),
      folders: filteredDSVs.filter((dsv) => isFolder(dsv.dataSource)),
      websites: filteredDSVs.filter((dsv) => isWebsite(dsv.dataSource)),
    }),
    [filteredDSVs]
  );

  // Check if the search term is a URL
  useEffect(() => {
    if (debouncedSearch.length >= MIN_SEARCH_QUERY_SIZE) {
      const candidate = nodeCandidateFromUrl(debouncedSearch.trim());
      setNodeOrUrlCandidate(candidate);
    } else {
      setNodeOrUrlCandidate(null);
    }
  }, [debouncedSearch]);

  const isSearching = debouncedSearch.length >= MIN_SEARCH_QUERY_SIZE;

  const getSearchItemSelectionState = useCallback(
    (item: DataSourceViewContentNode) =>
      getItemSelectionState(
        item,
        selectionConfigurations[item.dataSourceView.sId]
      ),
    [selectionConfigurations]
  );

  const getSearchItemCheckboxDisabled = useCallback(
    (item: DataSourceViewContentNode) =>
      isItemCheckboxDisabled(
        item,
        selectionConfigurations[item.dataSourceView.sId]
      ),
    [selectionConfigurations]
  );

  const onToggleSelection = useCallback(
    (item: DataSourceViewContentNode) => {
      setSelectionConfigurations((prevState) => {
        const selectionState = getItemSelectionState(
          item,
          prevState[item.dataSourceView.sId]
        );

        if (selectionState === "partial") {
          return deselectDescendants({ item, prevState });
        }

        return updateSelection({
          item,
          prevState,
          selectionMode,
        });
      });
    },
    [setSelectionConfigurations, selectionMode]
  );

  const displayManagedDsv =
    filteredGroups.managedDsv.length > 0 &&
    (useCase === "assistantBuilder" || useCase === "trackerBuilder");

  const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(
    null
  );
  const scrollViewportRef = useCallback((node: HTMLDivElement | null) => {
    setScrollViewport(node);
  }, []);

  useEffect(() => {
    if (focusSearchOnOpen) {
      return;
    }

    setSearchSpaceText("");
    setNodeOrUrlCandidate(null);
  }, [focusSearchOnOpen, setSearchSpaceText]);

  useEffect(() => {
    if (!focusSearchOnOpen || isMobile) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [focusSearchOnOpen, isMobile]);

  const searchInput = (
    <SearchInput
      ref={searchInputRef}
      name="search-dsv"
      placeholder={`Search in ${space.name}`}
      value={searchSpaceText}
      onChange={setSearchSpaceText}
    />
  );

  const searchResultsProps = {
    owner,
    space,
    dataSourceViews: filteredDSVs,
    viewType,
    allowAdminSearch,
    searchQuery: debouncedSearch,
    nodeOrUrlCandidate,
    filterTranscriptsProcessing: useCase === "transcriptsProcessing",
    selectionMode,
    getItemSelectionState: getSearchItemSelectionState,
    isItemCheckboxDisabled: getSearchItemCheckboxDisabled,
    onToggleSelection,
  };

  const treeContent = (
    <Tree isLoading={false} overflowVisible>
      {displayManagedDsv && (
        <Tree.Item
          key="connected"
          label="Connected Data"
          visual={CloudArrowLeftRight}
          type="node"
          defaultCollapsed
        >
          {filteredGroups.managedDsv.map((dataSourceView) => (
            <DataSourceViewSelector
              key={dataSourceView.sId}
              owner={owner}
              selectionConfiguration={
                selectionConfigurations[dataSourceView.sId] ??
                defaultSelectionConfiguration(dataSourceView)
              }
              setSelectionConfigurations={setSelectionConfigurations}
              viewType={viewType}
              isRootSelectable={isRootSelectable}
              defaultCollapsed={filteredGroups.managedDsv.length > 1}
              useCase={useCase}
              selectionMode={selectionMode}
              useContentNodes={useContentNodes}
            />
          ))}
        </Tree.Item>
      )}
      {filteredGroups.managedDsv.length > 0 &&
        useCase === "spaceDatasourceManagement" &&
        filteredGroups.managedDsv.map((dataSourceView) => (
          <DataSourceViewSelector
            key={dataSourceView.sId}
            owner={owner}
            selectionConfiguration={
              selectionConfigurations[dataSourceView.sId] ??
              defaultSelectionConfiguration(dataSourceView)
            }
            setSelectionConfigurations={setSelectionConfigurations}
            viewType={viewType}
            isRootSelectable={false}
            defaultCollapsed={filteredGroups.managedDsv.length > 1}
            useCase={useCase}
            selectionMode={selectionMode}
            useContentNodes={useContentNodes}
          />
        ))}
      {filteredGroups.folders.length > 0 && (
        <Tree.Item
          key="folders"
          label="Folders"
          visual={Folder}
          type="node"
          defaultCollapsed
        >
          {filteredGroups.folders.map((dataSourceView) => (
            <DataSourceViewSelector
              key={dataSourceView.sId}
              owner={owner}
              selectionConfiguration={
                selectionConfigurations[dataSourceView.sId] ??
                defaultSelectionConfiguration(dataSourceView)
              }
              setSelectionConfigurations={setSelectionConfigurations}
              viewType={viewType}
              isRootSelectable={isRootSelectable}
              defaultCollapsed={filteredGroups.folders.length > 1}
              useCase={useCase}
              selectionMode={selectionMode}
              useContentNodes={useContentNodes}
            />
          ))}
        </Tree.Item>
      )}
      {filteredGroups.websites.length > 0 &&
        useCase !== "transcriptsProcessing" && (
          <Tree.Item
            key="websites"
            label="Websites"
            visual={Globe01}
            type="node"
            defaultCollapsed
          >
            {filteredGroups.websites.map((dataSourceView) => (
              <DataSourceViewSelector
                key={dataSourceView.sId}
                owner={owner}
                selectionConfiguration={
                  selectionConfigurations[dataSourceView.sId] ??
                  defaultSelectionConfiguration(dataSourceView)
                }
                setSelectionConfigurations={setSelectionConfigurations}
                viewType={viewType}
                isRootSelectable={isRootSelectable}
                defaultCollapsed={filteredGroups.websites.length > 1}
                useCase={useCase}
                selectionMode={selectionMode}
                useContentNodes={useContentNodes}
              />
            ))}
          </Tree.Item>
        )}
    </Tree>
  );

  const renderFixedSearchLayout = useCallback(
    ({ warning, summary, list }: SearchResultsLayoutParts) => (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {warning && <div className="flex-none px-5 pt-1">{warning}</div>}
        <div className="flex-none shrink-0 px-5 pb-2">{summary}</div>
        <ScrollArea
          className="min-h-0 w-full flex-1"
          viewportRef={scrollViewportRef}
        >
          <SheetViewportProvider value={scrollViewport}>
            <div className="px-5 pb-4 pt-1">{list}</div>
          </SheetViewportProvider>
        </ScrollArea>
      </div>
    ),
    [scrollViewport, scrollViewportRef]
  );

  if (fixedSearchLayout) {
    return (
      <div className="dd-privacy-mask flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex-none shrink-0 px-5 pb-4 pt-3">{searchInput}</div>
        {isSearching ? (
          <DataSourceSelectionSearchResults
            {...searchResultsProps}
            renderLayout={renderFixedSearchLayout}
          />
        ) : (
          <ScrollArea
            className="min-h-0 w-full flex-1"
            viewportRef={scrollViewportRef}
          >
            <SheetViewportProvider value={scrollViewport}>
              <div className="px-5 pb-4 pt-1">{treeContent}</div>
            </SheetViewportProvider>
          </ScrollArea>
        )}
      </div>
    );
  }

  const selectorContent = isSearching ? (
    <DataSourceSelectionSearchResults {...searchResultsProps} />
  ) : (
    treeContent
  );

  return (
    <div className="dd-privacy-mask">
      <div className="sticky top-0 z-10 -mt-3 bg-background pb-4 pt-3 dark:bg-background-night">
        {searchInput}
      </div>
      {selectorContent}
    </div>
  );
}

interface DataSourceViewSelectorProps {
  owner: LightWorkspaceType;
  readonly?: boolean;
  selectionConfiguration: DataSourceViewSelectionConfiguration;
  setSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
  viewType: ContentNodesViewType;
  isRootSelectable: boolean;
  defaultCollapsed?: boolean;
  useCase?: DataSourceViewsSelectorProps["useCase"];
  selectionMode?: "checkbox" | "radio";
  useContentNodes?: UseInfiniteContentNodes;
}

// When `isRootSelectable` is false, you cannot select the entire data source and automatically sync new nodes
// added to the data source. You can however select all the available nodes at that moment and we show the button to
// select all in UI. We need to send all the available node ids to the backend, so we need to fetch
// all the available nodes separately (= different from the paginated nodes a user is seeing in the UI).
// We use useInfiniteDataSourceViewContentNodes hook and we keep fetching data until hasNextPage is false inside the useEffect.
export function DataSourceViewSelector({
  owner,
  readonly = false,
  selectionConfiguration,
  setSelectionConfigurations,
  viewType,
  isRootSelectable,
  defaultCollapsed = true,
  useCase,
  selectionMode = "checkbox",
  useContentNodes = useInfiniteDataSourceViewContentNodes,
}: DataSourceViewSelectorProps) {
  const { isDark } = useTheme();
  const dataSourceView = selectionConfiguration.dataSourceView;

  const LogoComponent = getConnectorProviderLogoWithFallback({
    provider: dataSourceView.dataSource.connectorProvider,
    isDark,
  });

  const internalIds = selectionConfiguration.selectedResources.map(
    (r) => r.internalId
  );

  // When users have multiple spaces, they can opt to select only one space per tool.
  // This is enforced in the UI via a radio button, ensuring single selection at a time.
  // However, selecting a new item in a different space doesn't automatically clear previous selections.
  // This function ensures that only the selections matching the current space are retained, removing any others.
  const keepOnlyOneSpaceIfApplicable = useCallback(
    (config: DataSourceViewSelectionConfigurations) => {
      if (!ONLY_ONE_SPACE_PER_SELECTION) {
        return config;
      }

      const { spaceId, sId } = dataSourceView;
      return Object.fromEntries(
        Object.entries(config).filter(
          ([key, value]) =>
            key === sId || value.dataSourceView.spaceId === spaceId
        )
      );
    },
    [dataSourceView]
  );

  const selectAll = useLazyLoadAllNodes({
    owner,
    dataSourceView,
    viewType,
    useContentNodes,
    onComplete: useCallback(
      (nodes: DataSourceViewContentNode[]) => {
        setSelectionConfigurations((prevState) =>
          applySelectionConfigUpdate({
            prevState,
            dataSourceView,
            update: { selectedResources: nodes, isSelectAll: false },
            selectionMode,
            keepOnlyOneSpaceIfApplicable,
          })
        );
      },
      [
        dataSourceView,
        selectionMode,
        keepOnlyOneSpaceIfApplicable,
        setSelectionConfigurations,
      ]
    ),
  });

  const hasActiveSelection =
    selectionConfiguration.selectedResources.length > 0 ||
    selectionConfiguration.isSelectAll;

  const handleSelectAll = () => {
    if (hasActiveSelection) {
      setSelectionConfigurations((prevState) =>
        omit(prevState, dataSourceView.sId)
      );
      selectAll.reset();
      return;
    }

    if (isRootSelectable) {
      setSelectionConfigurations((prevState) =>
        applySelectionConfigUpdate({
          prevState,
          dataSourceView,
          update: { selectedResources: [], isSelectAll: true },
          selectionMode,
          keepOnlyOneSpaceIfApplicable,
        })
      );
      return;
    }

    selectAll.trigger();
  };

  const isChecked = selectionConfiguration.isSelectAll
    ? true
    : internalIds.length > 0
      ? "partial"
      : false;

  const isTableView = viewType === "table";

  // Show the checkbox by default. Hide it only for tables view where no child items are partially checked.
  const hideCheckbox = readonly || (isTableView && isChecked !== "partial");

  const isExpandableRoot = canBeExpanded(dataSourceView.dataSource);
  const [isRootCollapsed, setIsRootCollapsed] = useState(defaultCollapsed);

  const selectedNodes = useMemo(
    () => getNodesFromConfig(selectionConfiguration),
    [selectionConfiguration]
  );

  const setSelectedNodes = useCallback(
    (updater: TreeSelectionModelUpdater) => {
      setSelectionConfigurations((prevState) => {
        const prevSelectionConfiguration =
          prevState[dataSourceView.sId] ??
          defaultSelectionConfiguration(dataSourceView);

        const selectedNodes = updater(
          getNodesFromConfig(prevSelectionConfiguration)
        );

        let updatedSelectedNodes = selectedNodes;
        if (selectionMode === "radio") {
          // Only keep the most recently selected node
          const selectedNodeEntries = Object.entries(selectedNodes).filter(
            ([, v]) => v.isSelected
          );

          if (selectedNodeEntries.length > 1) {
            const [latestNodeId, latestNode] = selectedNodeEntries[0];

            updatedSelectedNodes = {
              [latestNodeId]: latestNode,
            };
          }
        } else {
          updatedSelectedNodes = selectedNodes;
        }

        const updatedConfig = {
          ...prevSelectionConfiguration,
          selectedResources: Object.values(updatedSelectedNodes)
            .filter((v) => v.isSelected)
            .map((v) => ({
              ...v.node,
              dataSourceView: dataSourceView,
              parentInternalIds: v.parents,
              parentTitle: null, // The parentTitle is not known here, but it also not necessary.
            })),
          isSelectAll: false,
        };

        if (updatedConfig.selectedResources.length === 0) {
          // Nothing is selected at all, remove from the list
          return omit(prevState, dataSourceView.sId);
        }

        // Return a new object to trigger a re-render
        return keepOnlyOneSpaceIfApplicable({
          ...prevState,
          [dataSourceView.sId]: updatedConfig,
        });
      });
    },
    [
      dataSourceView,
      keepOnlyOneSpaceIfApplicable,
      setSelectionConfigurations,
      selectionMode,
    ]
  );

  const useResourcesHook = useCallback(
    (parentId: string | null) =>
      getUseResourceHook(
        owner,
        dataSourceView,
        viewType,
        useContentNodes
      )(parentId),
    [owner, dataSourceView, viewType, useContentNodes]
  );

  return (
    <div id={`dataSourceViewsSelector-${dataSourceView.dataSource.sId}`}>
      <Tree.Item
        key={dataSourceView.dataSource.id}
        label={getDisplayNameForDataSource(dataSourceView.dataSource)}
        visual={LogoComponent}
        defaultCollapsed={
          isRootSelectable || !isExpandableRoot ? defaultCollapsed : undefined
        }
        collapsed={
          !isRootSelectable && isExpandableRoot ? isRootCollapsed : undefined
        }
        onChevronClick={
          !isRootSelectable && isExpandableRoot
            ? () => setIsRootCollapsed((collapsed) => !collapsed)
            : undefined
        }
        onItemClick={
          !isRootSelectable
            ? isExpandableRoot
              ? () => setIsRootCollapsed((collapsed) => !collapsed)
              : () => {}
            : undefined
        }
        type={isExpandableRoot ? "node" : "leaf"}
        checkbox={
          hideCheckbox
            ? undefined
            : selectionMode === "radio"
              ? {
                  checked: isChecked === true,
                  onCheckedChange: handleSelectAll,
                  className: "rounded-full",
                }
              : {
                  checked: isChecked,
                  onCheckedChange: handleSelectAll,
                }
        }
        actions={
          !isRootSelectable && (
            <Button
              variant="ghost"
              size="xs"
              disabled={selectAll.isLoading}
              className="mr-4 text-xs"
              label={
                selectAll.isLoading
                  ? "Loading..."
                  : hasActiveSelection
                    ? "Unselect All"
                    : "Select All"
              }
              icon={CheckDone01}
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                handleSelectAll();
              }}
            />
          )
        }
      >
        {useCase !== "transcriptsProcessing" && (
          <ContentNodeTree
            selectedNodes={selectedNodes}
            setSelectedNodes={readonly ? undefined : setSelectedNodes}
            parentIsSelected={selectionConfiguration.isSelectAll}
            useResourcesHook={useResourcesHook}
            emptyComponent={
              viewType === "table" || viewType === "data_warehouse" ? (
                <Tree.Empty label="No tables" />
              ) : (
                <Tree.Empty label="No documents" />
              )
            }
            getLabel={(n) =>
              getDisplayTitleForDataSourceViewContentNode(
                n as DataSourceViewContentNode
              )
            }
            {...(selectionMode === "radio"
              ? { "data-selection-mode": "radio" }
              : {})}
          />
        )}
      </Tree.Item>
    </div>
  );
}
