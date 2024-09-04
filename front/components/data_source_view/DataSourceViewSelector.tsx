import {
  CloudArrowLeftRightIcon,
  FolderIcon,
  GlobeAltIcon,
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
import { useMemo } from "react";

import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import { useParentResourcesById } from "@app/hooks/useParentResourcesById";
import { orderDatasourceViewByImportance } from "@app/lib/assistant";
import {
  CONNECTOR_CONFIGURATIONS,
  getConnectorProviderLogoWithFallback,
} from "@app/lib/connector_providers";
import {
  getDisplayNameForDataSource,
  isFolder,
  isManaged,
  isWebsite,
} from "@app/lib/data_sources";

const MIN_TOTAL_DATA_SOURCES_TO_GROUP = 12;
const MIN_DATA_SOURCES_PER_KIND_TO_GROUP = 3;

type DataSourceViewsSelectorProps = {
  owner: LightWorkspaceType;
  dataSourceViews: DataSourceViewType[];
  selectionConfigurations: DataSourceViewSelectionConfigurations;
  setSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
  viewType: ContentNodesViewType;
};

export function DataSourceViewsSelector({
  owner,
  dataSourceViews,
  selectionConfigurations,
  setSelectionConfigurations,
  viewType,
}: DataSourceViewsSelectorProps) {
  // Apply grouping if there are many data sources, and there are enough of each kind
  // So we don't show a long list of data sources to the user

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

  console.log(">> orderDatasourceViews:", orderDatasourceViews);

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
        <Tree.Item key="folders" label="Files" visual={FolderIcon} type="node">
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

  // TODO(GROUPS_INFRA): useParentResourcesById should use views not data sources.
  const { parentsById, setParentsById } = useParentResourcesById({
    owner,
    dataSource: dataSourceView.dataSource,
    internalIds,
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

  const onToggleSelectAll = useMemo(() => {
    return (checked: boolean) => {
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
          return { ...prevState, [dataSourceView.sId]: config };
        }
      );
    };
  }, [dataSourceView, setParentsById, setSelectionConfigurations]);

  const isTableView = viewType === "tables";
  console.log(
    ">> checkedStatus:",
    checkedStatus,
    getDisplayNameForDataSource(dataSourceView.dataSource)
  );

  return (
    <Tree.Item
      key={dataSourceView.dataSource.name}
      label={getDisplayNameForDataSource(dataSourceView.dataSource)}
      visual={LogoComponent}
      type={
        isFolder(dataSourceView.dataSource) && !isTableView ? "leaf" : "node"
      }
      checkbox={
        isTableView && !isPartiallyChecked
          ? undefined
          : {
              checked: checkedStatus,
              onChange: onToggleSelectAll,
            }
      }
    >
      <DataSourceResourceSelectorTree
        owner={owner}
        dataSourceView={dataSourceView}
        showExpand={config?.isNested ?? true}
        selectedResourceIds={internalIds}
        selectedParents={selectedParents}
        onSelectChange={(node, parents, selected) => {
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

              if (
                config.selectedResources.length === 0 &&
                !config.isSelectAll
              ) {
                // Nothing is selected at all, remove from the list
                return _.omit(prevState, dataSourceView.sId);
              }

              // Return a new object to trigger a re-render
              return { ...prevState, [dataSourceView.sId]: config };
            }
          );
        }}
        parentIsSelected={selectionConfiguration.isSelectAll}
        viewType={viewType}
      />
    </Tree.Item>
  );
}
