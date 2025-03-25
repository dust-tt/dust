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
import { orderDatasourceViewByImportance } from "@app/lib/connectors";
import {
  DATA_SOURCE_MIME_TYPE,
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
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { useSpaceSearch } from "@app/lib/swr/spaces";
import type {
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

const getUseResourceHook =
  (
    owner: LightWorkspaceType,
    dataSourceView: DataSourceViewType,
    viewType: ContentNodesViewType,
    useContentNodes: typeof useDataSourceViewContentNodes
  ) =>
  (parentId: string | null) => {
    const {
      nodes,
      isNodesLoading,
      isNodesError,
      totalNodesCountIsAccurate,
      totalNodesCount,
    } = useContentNodes({
      owner,
      dataSourceView,
      parentId: parentId ?? undefined,
      viewType,
    });
    return {
      resources: nodes,
      totalResourceCount: totalNodesCount,
      isResourcesLoading: isNodesLoading,
      isResourcesError: isNodesError,
      isResourcesTruncated: !totalNodesCountIsAccurate,
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
        parents: r.parentInternalIds || [],
      },
      ...acc,
    }),
    {}
  );

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

  const filteredDSVs = useMemo(() => {
    const includesConnectorIDs: string[] = [];
    const excludesConnectorIDs: string[] = [];

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

  const { searchResultNodes, isSearchLoading, warningCode } = useSpaceSearch({
    dataSourceViews: filteredDSVs, // Use filtered DSVs on the search too.
    includeDataSources: true,
    owner,
    search: debouncedSearch,
    viewType,
    space,
  });

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

  const updateSelection = useCallback(
    (
      item: DataSourceViewContentNode,
      prevState: DataSourceViewSelectionConfigurations
    ): DataSourceViewSelectionConfigurations => {
      const { dataSourceView: dsv } = item;
      const prevConfig =
        prevState[dsv.sId] ?? defaultSelectionConfiguration(dsv);

      const exists = prevConfig.selectedResources.some(
        (r) => r.internalId === item.internalId
      );

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

      const newResources = exists
        ? prevConfig.selectedResources
        : [
            ...prevConfig.selectedResources,
            {
              ...item,
              dataSourceView: dsv,
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
    },
    []
  );

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
        (acc, item) => updateSelection(item, acc),
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
    updateSelection,
    searchResultNodes,
  ]);

  return (
    <div>
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
            updateSelection(item, prevState)
          );
        }}
        displayItemCount={useCase === "assistantBuilder"}
        onSelectAll={displaySelectAllButton ? handleSelectAll : undefined}
        contentMessage={contentMessage}
        renderItem={(item, selected) => {
          return (
            <div
              className={cn(
                "m-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-structure-50 dark:hover:bg-structure-50-night",
                selected && "bg-structure-50 dark:bg-structure-50-night"
              )}
              onClick={() => {
                setSearchResult(item);
                setSearchSpaceText("");
                setSelectionConfigurations((prevState) =>
                  updateSelection(item, prevState)
                );
              }}
            >
              {getVisualForDataSourceViewContentNode(item)({
                className: "min-w-4",
              })}
              <span className="flex-shrink truncate text-sm">{item.title}</span>
              {item.parentTitle && (
                <div className="ml-auto flex-none text-sm text-slate-500">
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
        variant: "amber",
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
}

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

  const { nodes: rootNodes } = useContentNodes({
    owner,
    dataSourceView,
    viewType,
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

        // Return a new object to trigger a re-render
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

  // Show the checkbox by default. Hide it only for tables where no child items are partially checked.
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
        const updatedConfig = {
          ...prevSelectionConfiguration,
          selectedResources: Object.values(selectedNodes)
            .filter((v) => v.isSelected)
            .map((v) => ({
              ...v.node,
              dataSourceView: dataSourceView,
              parentInternalIds: v.parents,
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
    [dataSourceView, keepOnlyOneSpaceIfApplicable, setSelectionConfigurations]
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
  const defaultExpandedIds =
    isExpanded && searchResult
      ? removeNulls([...new Set(searchResult.parentInternalIds)])
      : undefined;

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
              disabled={rootNodes.length === 0}
              className="mr-4 text-xs"
              label={hasActiveSelection ? "Unselect All" : "Select All"}
              icon={ListCheckIcon}
              onClick={handleSelectAll}
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
              viewType === "table" ? (
                <Tree.Empty label="No tables" />
              ) : (
                <Tree.Empty label="No documents" />
              )
            }
            defaultExpandedIds={defaultExpandedIds}
          />
        )}
      </Tree.Item>
    </div>
  );
}
