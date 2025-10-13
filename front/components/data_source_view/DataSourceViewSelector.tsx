// All mime types are okay to use from the public API.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { DATA_SOURCE_MIME_TYPE } from "@dust-tt/client";
import {
  Button,
  CloudArrowLeftRightIcon,
  cn,
  FolderIcon,
  GlobeAltIcon,
  InformationCircleIcon,
  ListCheckIcon,
  SearchInputWithPopover,
  Tree,
} from "@dust-tt/sparkle";
import type { ContentMessageProps } from "@dust-tt/sparkle/dist/esm/components/ContentMessage";
import _ from "lodash";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ContentNodeTreeItemStatus,
  TreeSelectionModelUpdater,
} from "@app/components/ContentNodeTree";
import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useDebounce } from "@app/hooks/useDebounce";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import type { NodeCandidate, UrlCandidate } from "@app/lib/connectors";
import {
  getViewTypeForURLNodeCandidateAccountingForNotion,
  isNodeCandidate,
  isUrlCandidate,
  nodeCandidateFromUrl,
  orderDatasourceViewByImportance,
} from "@app/lib/connectors";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import {
  canBeExpanded,
  getDisplayNameForDataSource,
  isFolder,
  isManaged,
  isRemoteDatabase,
  isWebsite,
} from "@app/lib/data_sources";
import {
  useDataSourceViewContentNodes,
  useInfiniteDataSourceViewContentNodes,
} from "@app/lib/swr/data_source_views";
import { useSpacesSearch } from "@app/lib/swr/spaces";
import type {
  ContentNode,
  ContentNodesViewType,
  DataSourceViewContentNode,
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  LightWorkspaceType,
  SearchWarningCode,
  SpaceType,
} from "@app/types";
import {
  assertNever,
  defaultSelectionConfiguration,
  MIN_SEARCH_QUERY_SIZE,
  removeNulls,
} from "@app/types";

const ONLY_ONE_SPACE_PER_SELECTION = true;
const ITEMS_PER_PAGE = 50;
const PAGE_SIZE = 1000;

const getUseResourceHook =
  (
    owner: LightWorkspaceType,
    dataSourceView: DataSourceViewType,
    viewType: ContentNodesViewType,
    useContentNodes: typeof useDataSourceViewContentNodes
  ) =>
  (parentId: string | null) => {
    // State for accumulating nodes for "load more".
    const [currentCursor, setCurrentCursor] = useState<string | null>(null);
    const [accumulatedNodes, setAccumulatedNodes] = useState<ContentNode[]>([]);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const {
      nodes: fetchedNodes,
      isNodesLoading: isInitialNodesLoading,
      isNodesError,
      totalNodesCountIsAccurate,
      totalNodesCount,
      nextPageCursor,
    } = useContentNodes({
      owner,
      dataSourceView,
      parentId: parentId ?? undefined,
      viewType,
      pagination: { cursor: currentCursor, limit: ITEMS_PER_PAGE },
    });

    useEffect(() => {
      // Skip if no nodes were fetched yet
      if (!fetchedNodes || fetchedNodes.length === 0) {
        return;
      }

      if (currentCursor === null) {
        // Initial load - just set the nodes directly
        setAccumulatedNodes(fetchedNodes);
        return;
      }

      if (isLoadingMore) {
        // Load more case - append new nodes to existing ones
        setAccumulatedNodes((prev) => {
          // Dedup new nodes.
          const existingIds = new Set(prev.map((node) => node.internalId));
          const newNodes = fetchedNodes.filter(
            (node) => !existingIds.has(node.internalId)
          );
          if (newNodes.length === 0) {
            // Avoid re-rendering if no new nodes are added.
            return prev;
          }

          return [...prev, ...newNodes];
        });

        setIsLoadingMore(false);
      }
    }, [fetchedNodes, currentCursor, isLoadingMore]);

    // Function to load more items
    const loadMore = useCallback(() => {
      if (nextPageCursor && !isLoadingMore) {
        setIsLoadingMore(true);
        setCurrentCursor(nextPageCursor);
      }
    }, [nextPageCursor, isLoadingMore]);

    return {
      resources: accumulatedNodes,
      totalResourceCount: totalNodesCount,
      isResourcesLoading:
        isInitialNodesLoading || (isLoadingMore && currentCursor === null),
      isResourcesError: isNodesError,
      isResourcesTruncated: !totalNodesCountIsAccurate,
      nextPageCursor,
      loadMore,
      isLoadingMore,
    };
  };

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

const updateSelection = ({
  item,
  prevState,
  selectionMode = "checkbox",
  onlyAdd = false,
}: {
  item: DataSourceViewContentNode;
  prevState: DataSourceViewSelectionConfigurations;
  selectionMode: "checkbox" | "radio";
  onlyAdd?: boolean;
}): DataSourceViewSelectionConfigurations => {
  const { dataSourceView: dsv } = item;
  const prevConfig = prevState[dsv.sId] ?? defaultSelectionConfiguration(dsv);

  const exists = prevConfig.selectedResources.some(
    (r) => r.internalId === item.internalId
  );

  if (onlyAdd && exists) {
    return _.cloneDeep(prevState);
  }

  if (item.mimeType === DATA_SOURCE_MIME_TYPE) {
    return {
      ...prevState,
      [dsv.sId]: {
        ...prevConfig,
        selectedResources: [],
        isSelectAll: true,
      },
    };
  }

  if (selectionMode === "radio" && !exists) {
    return {
      ...prevState,
      [dsv.sId]: {
        ...prevConfig,
        selectedResources: [
          {
            ...item,
            dataSourceView: dsv,
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            parentInternalIds: item.parentInternalIds || [],
          },
        ],
        isSelectAll: false,
      },
    };
  }

  const newResources = exists
    ? prevConfig.selectedResources.filter(
        (r) => r.internalId !== item.internalId
      )
    : [
        ...prevConfig.selectedResources,
        {
          ...item,
          dataSourceView: dsv,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          parentInternalIds: item.parentInternalIds || [],
        },
      ];

  return {
    ...prevState,
    [dsv.sId]: {
      ...prevConfig,
      selectedResources: newResources,
      isSelectAll: false,
    },
  };
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
}: DataSourceViewsSelectorProps) {
  const [searchResult, setSearchResult] = useState<
    DataSourceViewContentNode | undefined
  >();
  const {
    inputValue: searchSpaceText,
    debouncedValue: debouncedSearch,
    isDebouncing,
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

  const commonSearchParams = {
    owner,
    spaceIds: [space.sId],
    disabled: !debouncedSearch,
    dataSourceViewIdsBySpaceId:
      filteredDSVs.length > 0
        ? {
            [space.sId]: filteredDSVs.map((dsv) => dsv.sId),
          }
        : undefined,
    allowAdminSearch,
  };

  const {
    searchResultNodes: rawSearchResultNodes,
    isSearchLoading,
    warningCode,
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
        }
      : {
          ...commonSearchParams,
          search: debouncedSearch,
          searchSourceUrls: isUrlCandidate(nodeOrUrlCandidate),
          includeDataSources: true,
          viewType,
        }
  );

  // Process search results to convert them to DataSourceViewContentNode format
  const searchResultNodes = useMemo(() => {
    const processedResults = rawSearchResultNodes.flatMap((node) => {
      const { dataSourceViews, ...rest } = node;
      // Note: The workspace search API returns results from all data source views in the space.
      // We filter here to only show results from the data source views that are currently
      // displayed in the UI (filteredDSVs), which respects the assistant builder's filtering logic.
      const filteredViews = dataSourceViews.filter((view) =>
        filteredDSVs.some((dsv) => dsv.sId === view.sId)
      );
      return filteredViews.map((view) => ({
        ...rest,
        dataSourceView: view,
      }));
    });

    // Filter results based on URL match if we have a URL candidate
    return nodeOrUrlCandidate && !isNodeCandidate(nodeOrUrlCandidate)
      ? processedResults.filter(
          (node) => node.sourceUrl === nodeOrUrlCandidate.url
        )
      : processedResults;
  }, [rawSearchResultNodes, filteredDSVs, nodeOrUrlCandidate]);

  useEffect(() => {
    if (searchResult) {
      setTimeout(() => {
        const node = document.getElementById(
          `tree-node-${searchResult.internalId}`
        );
        node?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 100);
    }
  }, [searchResult]);

  const displayManagedDsv =
    filteredGroups.managedDsv.length > 0 &&
    (useCase === "assistantBuilder" || useCase === "trackerBuilder");

  const contentMessage = warningCode
    ? LimitedSearchContentMessage({ warningCode })
    : undefined;

  // We want to allow a "Select all" results from the search results in the Assistant Builder.
  // We think to make it a good XP we need to add some additional filters per data source.
  // Since this is something that we really need for Salesforce, we will start with this.
  const displaySelectAllButton = useMemo(() => {
    if (useCase !== "assistantBuilder" || searchResultNodes.length === 0) {
      return false;
    }

    const isAllSalesforce = searchResultNodes.every(
      (r) => r.dataSourceView.dataSource.connectorProvider === "salesforce"
    );
    return isAllSalesforce;

    // TODO: Replace with this once we are ready to select all from the search results for all data sources.
    // if (viewType !== "table") {
    //   return true;
    // }
    // const hasRemote = searchResultNodes.some((r) =>
    //   isRemoteDatabase(r.dataSourceView.dataSource)
    // );
    // const hasNonRemote = searchResultNodes.some(
    //   (r) => !isRemoteDatabase(r.dataSourceView.dataSource)
    // );
    // return hasRemote !== hasNonRemote;
  }, [searchResultNodes, useCase]);

  const handleSelectAll = useCallback(() => {
    setSearchSpaceText("");

    // Update all selections in a single state update.
    setSelectionConfigurations((prevState) => {
      const newState = searchResultNodes.reduce(
        (acc, item) =>
          updateSelection({
            item,
            prevState: acc,
            selectionMode,
            onlyAdd: true,
          }),
        prevState
      );
      return newState;
    });

    // Scroll to last item if there are results. Not perfect but no perfect solution here.
    if (searchResultNodes.length > 0) {
      setSearchResult(searchResultNodes[searchResultNodes.length - 1]);
    }
  }, [
    setSearchSpaceText,
    setSelectionConfigurations,
    searchResultNodes,
    selectionMode,
  ]);

  return (
    <div className="dd-privacy-mask">
      <SearchInputWithPopover
        value={searchSpaceText}
        onChange={setSearchSpaceText}
        name="search-dsv"
        open={searchSpaceText.length >= MIN_SEARCH_QUERY_SIZE}
        onOpenChange={(open) => {
          if (!open) {
            setSearchSpaceText("");
          }
        }}
        isLoading={isSearchLoading || isDebouncing}
        items={searchResultNodes}
        onItemSelect={(item) => {
          setSearchResult(item);
          setSearchSpaceText("");
          setSelectionConfigurations((prevState) =>
            updateSelection({
              item,
              prevState,
              selectionMode,
            })
          );
        }}
        displayItemCount={useCase === "assistantBuilder"}
        onSelectAll={displaySelectAllButton ? handleSelectAll : undefined}
        contentMessage={contentMessage}
        renderItem={(item, selected) => {
          return (
            <div
              className={cn(
                "m-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-background dark:hover:bg-background-night",
                selected && "bg-background dark:bg-background-night"
              )}
              onClick={() => {
                setSearchResult(item);
                setSearchSpaceText("");
                setSelectionConfigurations((prevState) =>
                  updateSelection({
                    item,
                    prevState,
                    selectionMode,
                  })
                );
              }}
            >
              {getVisualForDataSourceViewContentNode(item)({
                className: "min-w-4",
              })}
              <span className="copy-sm flex-shrink truncate">{item.title}</span>
              {item.parentTitle && (
                <div className="copy-sm ml-auto flex-none text-primary-500">
                  {getLocationForDataSourceViewContentNode(item)}
                </div>
              )}
            </div>
          );
        }}
        noResults="No results found"
      />
      <Tree
        isLoading={false}
        key={`dataSourceViewsSelector-${searchResult ? searchResult.internalId : ""}`}
      >
        {displayManagedDsv && (
          <Tree.Item
            key="connected"
            label="Connected Data"
            visual={CloudArrowLeftRightIcon}
            type="node"
            defaultCollapsed={
              !searchResult ||
              !isManaged(searchResult.dataSourceView.dataSource)
            }
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
                searchResult={searchResult}
                selectionMode={selectionMode}
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
              searchResult={searchResult}
              selectionMode={selectionMode}
            />
          ))}
        {filteredGroups.folders.length > 0 && (
          <Tree.Item
            key="folders"
            label="Folders"
            visual={FolderIcon}
            type="node"
            defaultCollapsed={
              !searchResult || !isFolder(searchResult.dataSourceView.dataSource)
            }
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
                searchResult={searchResult}
                selectionMode={selectionMode}
              />
            ))}
          </Tree.Item>
        )}
        {filteredGroups.websites.length > 0 &&
          useCase !== "transcriptsProcessing" && (
            <Tree.Item
              key="websites"
              label="Websites"
              visual={GlobeAltIcon}
              type="node"
              defaultCollapsed={
                !searchResult ||
                !isWebsite(searchResult.dataSourceView.dataSource)
              }
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
                  searchResult={searchResult}
                  selectionMode={selectionMode}
                />
              ))}
            </Tree.Item>
          )}
      </Tree>
    </div>
  );
}

function LimitedSearchContentMessage({
  warningCode,
}: {
  warningCode: SearchWarningCode;
}): ContentMessageProps | undefined {
  switch (warningCode) {
    case "truncated-query-clauses":
      return {
        title: "Search results are partial due to the large amount of data.",
        variant: "golden",
        icon: InformationCircleIcon,
        className: "w-full",
        size: "lg",
      };

    default:
      assertNever(warningCode);
  }
}

interface DataSourceViewSelectorProps {
  owner: LightWorkspaceType;
  readonly?: boolean;
  selectionConfiguration: DataSourceViewSelectionConfiguration;
  setSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
  useContentNodes?: typeof useDataSourceViewContentNodes;
  viewType: ContentNodesViewType;
  isRootSelectable: boolean;
  defaultCollapsed?: boolean;
  useCase?: DataSourceViewsSelectorProps["useCase"];
  searchResult?: DataSourceViewContentNode;
  selectionMode?: "checkbox" | "radio";
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
  useContentNodes = useDataSourceViewContentNodes,
  viewType,
  isRootSelectable,
  defaultCollapsed = true,
  useCase,
  searchResult,
  selectionMode = "checkbox",
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

  const {
    nodes: rootNodes,
    hasNextPage,
    isLoadingMore,
    loadMore,
  } = useInfiniteDataSourceViewContentNodes({
    owner,
    dataSourceView,
    viewType,
    pagination: { limit: PAGE_SIZE, cursor: null },
  });

  const hasActiveSelection =
    selectionConfiguration.selectedResources.length > 0 ||
    selectionConfiguration.isSelectAll;

  const handleSelectAll = () => {
    setSelectionConfigurations((prevState) => {
      if (hasActiveSelection) {
        // remove the whole dataSourceView from the list
        return _.omit(prevState, dataSourceView.sId);
      } else {
        const { sId } = dataSourceView;
        const defaultConfig = defaultSelectionConfiguration(dataSourceView);
        const prevConfig = prevState[sId] || defaultConfig;

        const updatedConfig = isRootSelectable
          ? {
              ...prevConfig,
              selectedResources: [],
              isSelectAll: true,
            }
          : {
              ...prevConfig,
              selectedResources: rootNodes,
              isSelectAll: false,
            };

        if (selectionMode === "radio") {
          return {
            [dataSourceView.sId]: updatedConfig,
          };
        }

        return keepOnlyOneSpaceIfApplicable({
          ...prevState,
          [dataSourceView.sId]: updatedConfig,
        });
      }
    });
  };

  const isChecked = selectionConfiguration.isSelectAll
    ? true
    : internalIds.length > 0
      ? "partial"
      : false;

  const isTableView = viewType === "table";

  // Show the checkbox by default. Hide it only for tables view where no child items are partially checked.
  const hideCheckbox = readonly || (isTableView && isChecked !== "partial");

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
          return _.omit(prevState, dataSourceView.sId);
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

  const isExpanded = searchResult
    ? searchResult.dataSourceView.sId === dataSourceView.sId
    : false;

  const defaultExpandedIds = useMemo(
    () =>
      searchResult && isExpanded
        ? removeNulls([
            ...new Set(
              searchResult.parentInternalIds?.filter(
                (id) =>
                  searchResult.expandable || id !== searchResult.internalId
              )
            ),
          ])
        : undefined,
    [searchResult, isExpanded]
  );

  useEffect(() => {
    const handleLoadMore = async () => {
      await loadMore();
    };

    if (hasNextPage && !isLoadingMore) {
      void handleLoadMore();
    }
  }, [hasNextPage, isLoadingMore, loadMore]);

  return (
    <div id={`dataSourceViewsSelector-${dataSourceView.dataSource.sId}`}>
      <Tree.Item
        key={dataSourceView.dataSource.id}
        label={getDisplayNameForDataSource(dataSourceView.dataSource)}
        visual={LogoComponent}
        defaultCollapsed={defaultCollapsed && !isExpanded}
        type={canBeExpanded(dataSourceView.dataSource) ? "node" : "leaf"}
        checkbox={
          hideCheckbox || (!isRootSelectable && !hasActiveSelection)
            ? undefined
            : selectionMode === "radio"
              ? {
                  checked: isChecked === true,
                  disabled: !isRootSelectable,
                  onCheckedChange: handleSelectAll,
                  className: "s-rounded-full",
                }
              : {
                  checked: isChecked,
                  disabled: !isRootSelectable,
                  onCheckedChange: handleSelectAll,
                }
        }
        actions={
          !isRootSelectable && (
            <Button
              variant="ghost"
              size="xs"
              disabled={rootNodes.length === 0 || isLoadingMore}
              className="mr-4 text-xs"
              label={hasActiveSelection ? "Unselect All" : "Select All"}
              icon={ListCheckIcon}
              onClick={(e: Event) => {
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
            defaultExpandedIds={defaultExpandedIds}
            {...(selectionMode === "radio"
              ? { "data-selection-mode": "radio" }
              : {})}
          />
        )}
      </Tree.Item>
    </div>
  );
}
