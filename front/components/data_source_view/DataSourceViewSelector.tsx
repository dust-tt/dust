import {
  CloudArrowLeftRightIcon,
  FolderIcon,
  GlobeAltIcon,
  Tree,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  WorkspaceType,
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
  owner: WorkspaceType;
  dataSourceViews: DataSourceViewType[];
  selectionConfigurations: DataSourceViewSelectionConfigurations;
  setSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
};

export function DataSourceViewsSelector({
  owner,
  dataSourceViews,
  selectionConfigurations,
  setSelectionConfigurations,
}: DataSourceViewsSelectorProps) {
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

  return (
    <Tree isLoading={false}>
      {groupManaged && (
        <Tree.Item
          key="connected"
          label="Connected Data"
          visual={CloudArrowLeftRightIcon}
          type="node"
        >
          {orderDatasourceViewByImportance(dataSourceViews)
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
              />
            ))}
        </Tree.Item>
      )}

      {orderDatasourceViewByImportance(
        dataSourceViews.filter(
          (dsv) =>
            (!groupFolders && isFolder(dsv.dataSource)) ||
            (!groupWebsites && isWebsite(dsv.dataSource)) ||
            (!groupManaged && isManaged(dsv.dataSource))
        )
      ).map((dataSourceView) => (
        <DataSourceViewSelector
          key={dataSourceView.sId}
          owner={owner}
          selectionConfiguration={
            selectionConfigurations[dataSourceView.sId] ??
            defaultSelectionConfiguration(dataSourceView)
          }
          setSelectionConfigurations={setSelectionConfigurations}
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
              />
            ))}
        </Tree.Item>
      )}
    </Tree>
  );
}

function DataSourceViewSelector({
  owner,
  selectionConfiguration,
  setSelectionConfigurations,
}: {
  owner: WorkspaceType;
  selectionConfiguration: DataSourceViewSelectionConfiguration;
  setSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
}) {
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

  return (
    <Tree.Item
      key={dataSourceView.dataSource.name}
      label={getDisplayNameForDataSource(dataSourceView.dataSource)}
      visual={LogoComponent}
      type={isFolder(dataSourceView.dataSource) ? "leaf" : "node"}
      checkbox={{
        checked: checkedStatus,
        onChange: onToggleSelectAll,
      }}
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
      />
    </Tree.Item>
  );
}
