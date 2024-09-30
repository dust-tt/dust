import {
  Button,
  CloudArrowLeftRightIcon,
  FolderIcon,
  GlobeAltIcon,
  ListCheckIcon,
  Spinner,
  Tree,
} from "@dust-tt/sparkle";
import type {
  ContentNodesViewType,
  DataSourceViewContentNode,
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { defaultSelectionConfiguration } from "@dust-tt/types";
import _ from "lodash";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { useCallback, useMemo } from "react";

import { VaultSelector } from "@app/components/assistant_builder/vaults/VaultSelector";
import DataSourceViewResourceSelectorTree from "@app/components/DataSourceViewResourceSelectorTree";
import { useParentResourcesById } from "@app/hooks/useParentResourcesById";
import { orderDatasourceViewByImportance } from "@app/lib/assistant";
import {
  CONNECTOR_CONFIGURATIONS,
  getConnectorProviderLogoWithFallback,
} from "@app/lib/connector_providers";
import {
  canBeExpanded,
  getDisplayNameForDataSource,
  isFolder,
  isManaged,
  isRemoteDatabase,
  isWebsite,
} from "@app/lib/data_sources";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { useVaults } from "@app/lib/swr/vaults";

const MIN_TOTAL_DATA_SOURCES_TO_GROUP = 12;
const MIN_DATA_SOURCES_PER_KIND_TO_GROUP = 3;
const ONLY_ONE_VAULT_PER_SELECTION = true;

const dataSourceViewsSelectorDisplayMode = [
  "assistant_builder",
  "managed_datasource",
] as const;

type DataSourceViewsSelectorDisplayModeType =
  (typeof dataSourceViewsSelectorDisplayMode)[number];

interface DataSourceViewsSelectorProps {
  owner: WorkspaceType;
  useCase: "vaultDatasourceManagement" | "assistantBuilder";
  dataSourceViews: DataSourceViewType[];
  allowedVaults?: VaultType[];
  selectionConfigurations: DataSourceViewSelectionConfigurations;
  setSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
  viewType: ContentNodesViewType;
  displayMode: DataSourceViewsSelectorDisplayModeType;
}

export function DataSourceViewsSelector({
  owner,
  useCase,
  dataSourceViews,
  allowedVaults,
  selectionConfigurations,
  setSelectionConfigurations,
  viewType,
  displayMode,
}: DataSourceViewsSelectorProps) {
  const { vaults, isVaultsLoading } = useVaults({ workspaceId: owner.sId });

  const includesConnectorIDs: string[] = [];
  const excludesConnectorIDs: string[] = [];

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

  const filteredDSVs = dataSourceViews.filter(
    (dsv) =>
      !dsv.dataSource.connectorId ||
      (dsv.dataSource.connectorId &&
        (!includesConnectorIDs.length ||
          includesConnectorIDs.includes(dsv.dataSource.connectorId)) &&
        (!excludesConnectorIDs.length ||
          !excludesConnectorIDs.includes(dsv.dataSource.connectorId)))
  );

  // Apply grouping if there are many data sources, and there are enough of each kind
  // So we don't show a long list of data sources to the user
  const applyGrouping = filteredDSVs.length >= MIN_TOTAL_DATA_SOURCES_TO_GROUP;

  const groupManaged =
    applyGrouping &&
    filteredDSVs.filter((dsv) => isManaged(dsv.dataSource)).length >=
      MIN_DATA_SOURCES_PER_KIND_TO_GROUP;

  const groupFolders =
    applyGrouping &&
    filteredDSVs.filter((dsv) => isFolder(dsv.dataSource)).length >=
      MIN_DATA_SOURCES_PER_KIND_TO_GROUP;

  const groupWebsites =
    applyGrouping &&
    filteredDSVs.filter((dsv) => isWebsite(dsv.dataSource)).length >=
      MIN_DATA_SOURCES_PER_KIND_TO_GROUP;

  const orderDatasourceViews = useMemo(
    () => orderDatasourceViewByImportance(filteredDSVs),
    [filteredDSVs]
  );

  const defaultVault = useMemo(() => {
    const firstKey = Object.keys(selectionConfigurations)[0] ?? null;
    return firstKey
      ? selectionConfigurations[firstKey]?.dataSourceView?.vaultId ?? ""
      : "";
  }, [selectionConfigurations]);

  const filteredVaults = useMemo(() => {
    const vaultIds = [...new Set(dataSourceViews.map((dsv) => dsv.vaultId))];
    return vaults.filter((v) => vaultIds.includes(v.sId));
  }, [vaults, dataSourceViews]);

  if (isVaultsLoading) {
    return <Spinner />;
  }

  if (filteredVaults.length > 1) {
    return (
      <VaultSelector
        vaults={filteredVaults}
        allowedVaults={allowedVaults}
        defaultVault={defaultVault}
        renderChildren={(vault) => {
          const dataSourceViewsForVault = vault
            ? dataSourceViews.filter((dsv) => dsv.vaultId === vault.sId)
            : dataSourceViews;

          if (dataSourceViewsForVault.length === 0) {
            return <>No data source in this vault.</>;
          }

          return (
            <DataSourceViewsSelector
              owner={owner}
              useCase={useCase}
              dataSourceViews={dataSourceViewsForVault}
              selectionConfigurations={selectionConfigurations}
              setSelectionConfigurations={setSelectionConfigurations}
              viewType={viewType}
              displayMode={displayMode}
            />
          );
        }}
      />
    );
  } else {
    return (
      <Tree isLoading={false}>
        {groupManaged && (
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
                  displayMode={displayMode}
                />
              ))}
          </Tree.Item>
        )}

        {orderDatasourceViews
          .filter(
            (dsv) =>
              (!groupFolders && isFolder(dsv.dataSource)) ||
              (!groupWebsites && isWebsite(dsv.dataSource)) ||
              (!groupManaged && isManaged(dsv.dataSource))
          )
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
              displayMode={displayMode}
            />
          ))}

        {groupFolders && (
          <Tree.Item
            key="folders"
            label="Folders"
            visual={FolderIcon}
            type="node"
          >
            {dataSourceViews
              .filter((dsv) => isFolder(dsv.dataSource))
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
                  displayMode={displayMode}
                />
              ))}
          </Tree.Item>
        )}

        {groupWebsites && (
          <Tree.Item
            key="websites"
            label="Websites"
            visual={GlobeAltIcon}
            type="node"
          >
            {dataSourceViews
              .filter((dsv) => isWebsite(dsv.dataSource))
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
                  displayMode={displayMode}
                />
              ))}
          </Tree.Item>
        )}
      </Tree>
    );
  }
}

interface DataSourceViewSelectorProps {
  owner: WorkspaceType;
  readonly?: boolean;
  selectionConfiguration: DataSourceViewSelectionConfiguration;
  setSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
  useContentNodes?: typeof useDataSourceViewContentNodes;
  viewType: ContentNodesViewType;
  displayMode: DataSourceViewsSelectorDisplayModeType;
}

export function DataSourceViewSelector({
  owner,
  readonly = false,
  selectionConfiguration,
  setSelectionConfigurations,
  useContentNodes = useDataSourceViewContentNodes,
  viewType,
  displayMode,
}: DataSourceViewSelectorProps) {
  const [isSelectedAll, setIsSelectedAll] = useState(false);
  const { parentsById, setParentsById } = useParentResourcesById({
    selectedResources: selectionConfiguration.selectedResources,
  });

  const dataSourceView = selectionConfiguration.dataSourceView;
  const config = dataSourceView.dataSource.connectorProvider
    ? CONNECTOR_CONFIGURATIONS[dataSourceView.dataSource.connectorProvider]
    : null;
  const LogoComponent = getConnectorProviderLogoWithFallback(
    dataSourceView.dataSource.connectorProvider,
    FolderIcon
  );

  const internalIds = selectionConfiguration.selectedResources.map(
    (r) => r.internalId
  );

  const selectedParents = [
    ...new Set(Object.values(parentsById).flatMap((c) => [...c])),
  ];

  // When users have multiple vaults, they can opt to select only one vault per tool.
  // This is enforced in the UI via a radio button, ensuring single selection at a time.
  // However, selecting a new item in a different vault doesn't automatically clear previous selections.
  // This function ensures that only the selections matching the current vault are retained, removing any others.
  const keepOnlyOneVaultIfApplicable = useCallback(
    (config: DataSourceViewSelectionConfigurations) => {
      if (!ONLY_ONE_VAULT_PER_SELECTION) {
        return config;
      }

      const { vaultId, sId } = dataSourceView;
      return Object.fromEntries(
        Object.entries(config).filter(
          ([key, value]) =>
            key === sId || value.dataSourceView.vaultId === vaultId
        )
      );
    },
    [dataSourceView]
  );

  const onSelectChange = useCallback(
    (node: DataSourceViewContentNode, parents: string[], selected: boolean) => {
      // Setting parentsById
      setParentsById((prevState) => {
        const newParentsById = { ...prevState };
        if (selected) {
          newParentsById[node.internalId] = new Set(parents);
        } else {
          delete newParentsById[node.internalId];
        }
        return newParentsById;
      });

      // Setting selectedResources
      setSelectionConfigurations(
        (prevState: DataSourceViewSelectionConfigurations) => {
          const config =
            prevState[dataSourceView.sId] ??
            defaultSelectionConfiguration(dataSourceView);

          if (selected) {
            config.selectedResources.push(node);
            // filter selectedResources to remove duplicates
            config.selectedResources = _.uniqBy(
              config.selectedResources,
              "internalId"
            );
          } else {
            config.selectedResources = config.selectedResources.filter(
              (r) => r.internalId !== node.internalId
            );
          }

          if (config.selectedResources.length === 0 && !config.isSelectAll) {
            // Nothing is selected at all, remove from the list
            return _.omit(prevState, dataSourceView.sId);
          }

          // Return a new object to trigger a re-render
          return keepOnlyOneVaultIfApplicable({
            ...prevState,
            [dataSourceView.sId]: config,
          });
        }
      );
    },
    [
      dataSourceView,
      keepOnlyOneVaultIfApplicable,
      setParentsById,
      setSelectionConfigurations,
    ]
  );

  const isPartiallyChecked = internalIds.length > 0;

  const checkedStatus = selectionConfiguration.isSelectAll
    ? "checked"
    : isPartiallyChecked
      ? "partial"
      : "unchecked";

  const handleSelectAll = () => {
    document
      .querySelectorAll<HTMLInputElement>(
        `#dataSourceViewsSelector-${dataSourceView.dataSource.name} label > input[type="checkbox"]:first-child`
      )
      .forEach((el) => {
        if (el.checked === isSelectedAll) {
          el.click();
        }
      });
    setIsSelectedAll(!isSelectedAll);
  };

  return (
    <div id={`dataSourceViewsSelector-${dataSourceView.dataSource.name}`}>
      {displayMode === "assistant_builder" ? (
        <Tree.Item
          key={dataSourceView.dataSource.id}
          label={getDisplayNameForDataSource(dataSourceView.dataSource)}
          visual={LogoComponent}
          type={
            canBeExpanded(viewType, dataSourceView.dataSource) ? "node" : "leaf"
          }
          checkbox={{
            checked: checkedStatus,
            onChange: () => {
              document
                .querySelectorAll<HTMLInputElement>(
                  `#dataSourceViewsSelector-${dataSourceView.dataSource.name} label > input[type="checkbox"]:first-child`
                )
                .forEach((el) => {
                  if (el.checked && !isSelectedAll) {
                    return;
                  } else {
                    el.click();
                  }
                });
              setIsSelectedAll(!isSelectedAll);
            },
          }}
        >
          <DataSourceViewResourceSelectorTree
            dataSourceView={dataSourceView}
            onSelectChange={onSelectChange}
            owner={owner}
            parentIsSelected={selectionConfiguration.isSelectAll}
            readonly={readonly}
            selectedParents={selectedParents}
            selectedResourceIds={internalIds}
            showExpand={config?.isNested ?? true}
            useContentNodes={useContentNodes}
            viewType={viewType}
          />
        </Tree.Item>
      ) : (
        <Tree.Item
          key={dataSourceView.dataSource.name}
          label={getDisplayNameForDataSource(dataSourceView.dataSource)}
          visual={LogoComponent}
          type={
            canBeExpanded(viewType, dataSourceView.dataSource) ? "node" : "leaf"
          }
          actions={
            <Button
              variant="tertiary"
              size="xs"
              className="mr-4"
              label={isSelectedAll ? "Unselect All" : "Select All"}
              icon={ListCheckIcon}
              onClick={handleSelectAll}
            />
          }
        />
      )}
      <DataSourceViewResourceSelectorTree
        dataSourceView={dataSourceView}
        onSelectChange={onSelectChange}
        owner={owner}
        parentIsSelected={selectionConfiguration.isSelectAll}
        readonly={readonly}
        selectedParents={selectedParents}
        selectedResourceIds={internalIds}
        showExpand={config?.isNested ?? true}
        useContentNodes={useContentNodes}
        viewType={viewType}
      />
    </div>
  );
}
