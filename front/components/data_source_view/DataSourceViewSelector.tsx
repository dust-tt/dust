import {
  Chip,
  CloudArrowLeftRightIcon,
  FolderIcon,
  GlobeAltIcon,
  Icon,
  Page,
  RadioButton,
  Spinner,
  Tree,
} from "@dust-tt/sparkle";
import type {
  ContentNodesViewType,
  DataSourceViewContentNode,
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  LightWorkspaceType,
  VaultType,
} from "@dust-tt/types";
import { defaultSelectionConfiguration } from "@dust-tt/types";
import _ from "lodash";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";

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
import { useVaults } from "@app/lib/swr/vaults";
import { classNames } from "@app/lib/utils";
import { getVaultIcon, getVaultName } from "@app/lib/vaults";

const MIN_TOTAL_DATA_SOURCES_TO_GROUP = 12;
const MIN_DATA_SOURCES_PER_KIND_TO_GROUP = 3;
const ONLY_ONE_VAULT_PER_SELECTION = true;

interface DataSourceViewsSelectorProps {
  owner: LightWorkspaceType;
  dataSourceViews: DataSourceViewType[];
  allowedVaults?: VaultType[];
  selectionConfigurations: DataSourceViewSelectionConfigurations;
  setSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
  viewType: ContentNodesViewType;
}

function VaultSelector({
  owner,
  dataSourceViews,
  allowedVaults,
  selectionConfigurations,
  setSelectionConfigurations,
  viewType,
}: DataSourceViewsSelectorProps) {
  const dataSourceViewsByVaultId = useMemo(
    () => _.groupBy(dataSourceViews, (dsv) => dsv.vaultId),
    [dataSourceViews]
  );

  const { vaults, isVaultsError, isVaultsLoading } = useVaults({
    workspaceId: owner.sId,
  });

  const [selectedVault, setSelectedVault] = useState<string>(
    Object.keys(selectionConfigurations).length > 0
      ? selectionConfigurations[Object.keys(selectionConfigurations)[0]]
          .dataSourceView.vaultId
      : ""
  );

  if (isVaultsLoading || isVaultsError || !vaults) {
    return <Spinner />;
  }

  if (Object.keys(dataSourceViewsByVaultId).length === 1) {
    return (
      <DataSourceViewsSelector
        owner={owner}
        dataSourceViews={dataSourceViews}
        selectionConfigurations={selectionConfigurations}
        setSelectionConfigurations={setSelectionConfigurations}
        viewType={viewType}
      />
    );
  } else {
    return (
      <div>
        <Page.Separator />
        {Object.keys(dataSourceViewsByVaultId).map((vaultId) => {
          const vault = vaults.find((v) => v.sId === vaultId);
          if (!vault) {
            // Should never happen
            return null;
          }
          const disabled = !(allowedVaults
            ? allowedVaults.find((v) => v.sId === vaultId)
            : false);
          return (
            <div key={vaultId}>
              <RadioButton
                name={`Vault ${vaultId}`}
                choices={[
                  {
                    label: (
                      <>
                        <Icon
                          visual={getVaultIcon(vault)}
                          size="md"
                          className="s-flex-shrink-0 ml-3 inline-block align-middle text-brand"
                        />
                        <span
                          className={classNames(
                            "s-text-element-900",
                            "align-middle",
                            !disabled ? "font-bold" : "italic"
                          )}
                        >
                          {getVaultName(vault)}{" "}
                          {disabled && (
                            <Chip
                              key="xs-warning"
                              size="xs"
                              className="ml-2"
                              label="Disabled: only one vault allowed per assistant"
                              color="warning"
                            />
                          )}
                        </span>
                      </>
                    ),
                    value: vaultId,
                    disabled: disabled,
                  },
                ]}
                value={selectedVault}
                onChange={() => setSelectedVault(vaultId)}
              />
              {selectedVault === vaultId && (
                <DataSourceViewsSelector
                  owner={owner}
                  dataSourceViews={dataSourceViewsByVaultId[selectedVault]}
                  selectionConfigurations={selectionConfigurations}
                  setSelectionConfigurations={setSelectionConfigurations}
                  viewType={viewType}
                />
              )}
              <Page.Separator />
            </div>
          );
        })}
      </div>
    );
  }
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

  if (nbOfVaults > 1) {
    return (
      <VaultSelector
        {...{
          owner,
          dataSourceViews,
          allowedVaults,
          selectionConfigurations,
          setSelectionConfigurations,
          viewType,
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
  owner: LightWorkspaceType;
  selectionConfiguration: DataSourceViewSelectionConfiguration;
  setSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
  viewType: ContentNodesViewType;
}

function DataSourceViewSelector({
  owner,
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

  // If the user has multiples vaults, they can choose to only select one vault per tool
  // It's forced in the UI because it's a radio button
  // However, when they select something in another vault, the previous selections will not be removed automatically
  // This function is used to remove the all the previous selections that do not match the passed selection's vault
  const keepOnlyOneVaultIfApplicable = useCallback(
    (config: DataSourceViewSelectionConfigurations) => {
      if (ONLY_ONE_VAULT_PER_SELECTION) {
        // Keep only the vault of the current dataSourceView
        const vaultId = dataSourceView.vaultId;
        return Object.entries(config).reduce(
          (acc, [key, value]) =>
            key === dataSourceView.sId ||
            value.dataSourceView.vaultId === vaultId
              ? { ...acc, [key]: value }
              : acc,
          {}
        );
      } else {
        return config;
      }
    },
    [dataSourceView.sId, dataSourceView.vaultId]
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
  const hideCheckbox = isTableView && !isPartiallyChecked;

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
        owner={owner}
        dataSourceView={dataSourceView}
        showExpand={config?.isNested ?? true}
        selectedResourceIds={internalIds}
        selectedParents={selectedParents}
        onSelectChange={onSelectChange}
        parentIsSelected={selectionConfiguration.isSelectAll}
        viewType={viewType}
      />
    </Tree.Item>
  );
}
