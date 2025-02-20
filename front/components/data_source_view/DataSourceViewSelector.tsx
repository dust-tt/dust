import {
  Button,
  CloudArrowLeftRightIcon,
  FolderIcon,
  GlobeAltIcon,
  ListCheckIcon,
  Tree,
} from "@dust-tt/sparkle";
import type {
  ContentNodesViewType,
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { defaultSelectionConfiguration } from "@dust-tt/types";
import _ from "lodash";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo } from "react";

import type {
  ContentNodeTreeItemStatus,
  TreeSelectionModelUpdater,
} from "@app/components/ContentNodeTree";
import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { orderDatasourceViewByImportance } from "@app/lib/connectors";
import {
  canBeExpanded,
  getDisplayNameForDataSource,
  isFolder,
  isManaged,
  isRemoteDatabase,
  isWebsite,
} from "@app/lib/data_sources";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";

const ONLY_ONE_SPACE_PER_SELECTION = true;

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
          n.preventSelection || (viewType === "tables" && n.type !== "Table"),
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
}

export function DataSourceViewsSelector({
  owner,
  useCase,
  dataSourceViews,
  selectionConfigurations,
  setSelectionConfigurations,
  viewType,
  isRootSelectable,
}: DataSourceViewsSelectorProps) {
  const includesConnectorIDs: (string | null)[] = [];
  const excludesConnectorIDs: (string | null)[] = [];

  // If view type is tables
  // You can either select tables from the same remote database (as the query will be executed live on the database)
  // Or select tables from different non-remote databases (as we load all data in the same sqlite database)
  if (viewType === "tables" && useCase === "assistantBuilder") {
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

  return (
    <Tree isLoading={false}>
      {displayManagedDsv && (
        <Tree.Item
          key="connected"
          label="Connected Data"
          visual={CloudArrowLeftRightIcon}
          type="node"
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
          />
        ))}
      {folders.length > 0 && (
        <Tree.Item
          key="folders"
          label="Folders"
          visual={FolderIcon}
          type="node"
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
            />
          ))}
        </Tree.Item>
      )}
    </Tree>
  );
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

  const isTableView = viewType === "tables";

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

  return (
    <div id={`dataSourceViewsSelector-${dataSourceView.dataSource.sId}`}>
      <Tree.Item
        key={dataSourceView.dataSource.id}
        label={getDisplayNameForDataSource(dataSourceView.dataSource)}
        visual={LogoComponent}
        defaultCollapsed={defaultCollapsed}
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
              viewType === "tables" ? (
                <Tree.Empty label="No tables" />
              ) : (
                <Tree.Empty label="No documents" />
              )
            }
          />
        )}
      </Tree.Item>
    </div>
  );
}
