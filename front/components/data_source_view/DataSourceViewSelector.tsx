import {
  CloudArrowLeftRightIcon,
  FolderIcon,
  GlobeAltIcon,
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
  isWebsite,
} from "@app/lib/data_sources";

const MIN_TOTAL_DATA_SOURCES_TO_GROUP = 12;
const MIN_DATA_SOURCES_PER_KIND_TO_GROUP = 3;
const ONLY_ONE_VAULT_PER_SELECTION = true;

interface DataSourceViewsSelectorProps {
  owner: WorkspaceType;
  dataSourceViews: DataSourceViewType[];
  allowedVaults?: VaultType[];
  selectionConfigurations: DataSourceViewSelectionConfigurations;
  setSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
  viewType: ContentNodesViewType;
}

export function DataSourceViewsSelector({
  owner,
  dataSourceViews,
  allowedVaults,
  selectionConfigurations,
  setSelectionConfigurations,
  viewType,
}: DataSourceViewsSelectorProps) {
  // Apply grouping if there are many data sources, and there are enough of each kind
  // So we don't show a long list of data sources to the user
  const nbOfVaults = _.uniqBy(dataSourceViews, (dsv) => dsv.vaultId).length;

  const applyGrouping =
    dataSourceViews.length >= MIN_TOTAL_DATA_SOURCES_TO_GROUP;

  const groupManaged =
    applyGrouping &&
    dataSourceViews.filter((dsv) => isManaged(dsv.dataSource)).length >=
      MIN_DATA_SOURCES_PER_KIND_TO_GROUP;

  const groupFolders =
    applyGrouping &&
    dataSourceViews.filter((dsv) => isFolder(dsv.dataSource)).length >=
      MIN_DATA_SOURCES_PER_KIND_TO_GROUP;

  const groupWebsites =
    applyGrouping &&
    dataSourceViews.filter((dsv) => isWebsite(dsv.dataSource)).length >=
      MIN_DATA_SOURCES_PER_KIND_TO_GROUP;

  const orderDatasourceViews = useMemo(
    () => orderDatasourceViewByImportance(dataSourceViews),
    [dataSourceViews]
  );

  const defaultVault = useMemo(() => {
    const firstKey = Object.keys(selectionConfigurations)[0] ?? null;
    return firstKey
      ? selectionConfigurations[firstKey]?.dataSourceView?.vaultId ?? ""
      : "";
  }, [selectionConfigurations]);

  if (nbOfVaults > 1) {
    return (
      <VaultSelector
        owner={owner}
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
              dataSourceViews={dataSourceViewsForVault}
              selectionConfigurations={selectionConfigurations}
              setSelectionConfigurations={setSelectionConfigurations}
              viewType={viewType}
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
  viewType: ContentNodesViewType;
}

export function DataSourceViewSelector({
  owner,
  readonly = false,
  selectionConfiguration,
  setSelectionConfigurations,
  viewType,
}: DataSourceViewSelectorProps) {
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

  const { parentsById, setParentsById } = useParentResourcesById({
    selectedResources: selectionConfiguration.selectedResources,
  });

  const selectedParents = [
    ...new Set(Object.values(parentsById).flatMap((c) => [...c])),
  ];

  const isPartiallyChecked = internalIds.length > 0;

  const checkedStatus = selectionConfiguration.isSelectAll
    ? "checked"
    : isPartiallyChecked
      ? "partial"
      : "unchecked";

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

  const onToggleSelectAll = useCallback(
    (checked: boolean) => {
      // Setting parentsById
      setParentsById({});

      // Setting selectedResources
      setSelectionConfigurations(
        (prevState: DataSourceViewSelectionConfigurations) => {
          if (!checked) {
            // Nothing is selected at all, remove from the list
            return _.omit(prevState, dataSourceView.sId);
          }

          const config =
            prevState[dataSourceView.sId] ??
            defaultSelectionConfiguration(dataSourceView);

          config.isSelectAll = checked;
          config.selectedResources = [];

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

  const isTableView = viewType === "tables";

  // Show the checkbox by default. Hide it only for tables where no child items are partially checked.
  const hideCheckbox = readonly || (isTableView && !isPartiallyChecked);

  return (
    <Tree.Item
      key={dataSourceView.dataSource.name}
      label={getDisplayNameForDataSource(dataSourceView.dataSource)}
      visual={LogoComponent}
      type={
        canBeExpanded(viewType, dataSourceView.dataSource) ? "node" : "leaf"
      }
      checkbox={
        hideCheckbox
          ? undefined
          : {
              checked: checkedStatus,
              onChange: onToggleSelectAll,
            }
      }
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
        viewType={viewType}
      />
    </Tree.Item>
  );
}
