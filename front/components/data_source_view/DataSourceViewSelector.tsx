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
import type {
  ContentNodesViewType,
  DataSourceViewContentNode,
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  LightWorkspaceType,
  SearchWarningCode,
  SpaceType,
} from "@dust-tt/types";
import {
  assertNever,
  defaultSelectionConfiguration,
  removeNulls,
} from "@dust-tt/types";
import _ from "lodash";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ContentNodeTreeItemStatus,
  TreeSelectionModelUpdater,
} from "@app/components/ContentNodeTree";
import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { orderDatasourceViewByImportance } from "@app/lib/connectors";
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
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { useSpaceSearch } from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";

const ONLY_ONE_SPACE_PER_SELECTION = true;
const MIN_SEARCH_QUERY_SIZE = 3;

const getUseResourceHook =
  (
    owner: LightWorkspaceType,
    dataSourceView: DataSourceViewType,
    viewType: ContentNodesViewType,
    useContentNodes: typeof useDataSourceViewContentNodes
  ) =>
  (parentId: string | null) => {
    const { nodes, isNodesLoading, isNodesError } = useContentNodes({
      owner,
      dataSourceView,
      parentId: parentId ?? undefined,
      viewType,
    });
    return {
      resources: nodes.map((n) => ({
        ...n,
        preventSelection:
          n.preventSelection || (viewType === "table" && n.type !== "table"),
      })),
      isResourcesLoading: isNodesLoading,
      isResourcesError: isNodesError,
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
  // TODO(20250221, search-kb): remove this once the feature flag is enabled by default
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });
  const searchFeatureFlag = featureFlags.includes("search_knowledge_builder");

  const [searchResult, setSearchResult] = useState<
    DataSourceViewContentNode | undefined
  >();
  const [searchSpaceText, setSearchSpaceText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  const { searchResultNodes, isSearchLoading, warningCode } = useSpaceSearch({
    dataSourceViews,
    disabled: !searchFeatureFlag,
    includeDataSources: true,
    owner,
    search: debouncedSearch,
    viewType,
    space,
  });

  useEffect(() => {
    if (searchFeatureFlag) {
      const timeout = setTimeout(() => {
        setDebouncedSearch(
          searchSpaceText.length >= MIN_SEARCH_QUERY_SIZE ? searchSpaceText : ""
        );
      }, 300);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [searchSpaceText, searchFeatureFlag]);

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

  const includesConnectorIDs: (string | null)[] = [];
  const excludesConnectorIDs: (string | null)[] = [];

  // If view type is tables
  // You can either select tables from the same remote database (as the query will be executed live on the database)
  // Or select tables from different non-remote databases (as we load all data in the same sqlite database)
  if (viewType === "table" && useCase === "assistantBuilder") {
    // Find the first data source in the selection configurations
    const selection = Object.values(selectionConfigurations);
    const firstDs =
      selection.length > 0 ? selection[0].dataSourceView.dataSource : null;

    if (firstDs) {
      // If it's a remote database, we only allow selecting tables with the same connector
      if (isRemoteDatabase(firstDs)) {
        includesConnectorIDs.push(firstDs.connectorId);
      } else {
        // Otherwise, we exclude the connector ID of all remote databases providers
        dataSourceViews.forEach((dsv) => {
          if (isRemoteDatabase(dsv.dataSource)) {
            excludesConnectorIDs.push(dsv.dataSource.connectorId);
          }
        });
      }
    }
  }
  const orderDatasourceViews = useMemo(
    () => orderDatasourceViewByImportance(dataSourceViews),
    [dataSourceViews]
  );

  const filteredDSVs = orderDatasourceViews.filter(
    (dsv) =>
      (!includesConnectorIDs.length ||
        includesConnectorIDs.includes(dsv.dataSource.connectorId)) &&
      (!excludesConnectorIDs.length ||
        !excludesConnectorIDs.includes(dsv.dataSource.connectorId))
  );

  const managedDsv = filteredDSVs.filter((dsv) => isManaged(dsv.dataSource));
  const folders = filteredDSVs.filter((dsv) => isFolder(dsv.dataSource));
  const websites = filteredDSVs.filter((dsv) => isWebsite(dsv.dataSource));

  const displayManagedDsv =
    managedDsv.length > 0 &&
    (useCase === "assistantBuilder" || useCase === "trackerBuilder");

  function updateSelection(
    item: DataSourceViewContentNode,
    prevState: DataSourceViewSelectionConfigurations
  ): DataSourceViewSelectionConfigurations {
    const { dataSourceView: dsv } = item;
    const prevConfig = prevState[dsv.sId] ?? defaultSelectionConfiguration(dsv);

    const exists = prevConfig.selectedResources.some(
      (r) => r.internalId === item.internalId
    );

    if (item.mimeType === "application/vnd.dust.datasource") {
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
  }

  const contentMessage = warningCode
    ? LimitedSearchContentMessage({ warningCode })
    : undefined;

  return (
    <div>
      {searchFeatureFlag && (
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
          isLoading={isSearchLoading}
          items={searchResultNodes}
          onItemSelect={(item) => {
            setSearchResult(item);
            setSearchSpaceText("");
            setSelectionConfigurations((prevState) =>
              updateSelection(item, prevState)
            );
          }}
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
                <span className="flex-shrink truncate text-sm">
                  {item.title}
                </span>
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
      )}
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
            {orderDatasourceViews
              .filter((dsv) => isManaged(dsv.dataSource))
              .map((dataSourceView) => (
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
                  defaultCollapsed={filteredDSVs.length > 1}
                  useCase={useCase}
                  searchResult={searchResult}
                />
              ))}
          </Tree.Item>
        )}
        {managedDsv.length > 0 &&
          useCase === "spaceDatasourceManagement" &&
          managedDsv.map((dataSourceView) => (
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
              defaultCollapsed={filteredDSVs.length > 1}
              useCase={useCase}
              searchResult={searchResult}
            />
          ))}
        {folders.length > 0 && (
          <Tree.Item
            key="folders"
            label="Folders"
            visual={FolderIcon}
            type="node"
            defaultCollapsed={
              !searchResult || !isFolder(searchResult.dataSourceView.dataSource)
            }
          >
            {folders.map((dataSourceView) => (
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
                defaultCollapsed={filteredDSVs.length > 1}
                useCase={useCase}
                searchResult={searchResult}
              />
            ))}
          </Tree.Item>
        )}
        {websites.length > 0 && useCase !== "transcriptsProcessing" && (
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
            {websites.map((dataSourceView) => (
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
                defaultCollapsed={filteredDSVs.length > 1}
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
