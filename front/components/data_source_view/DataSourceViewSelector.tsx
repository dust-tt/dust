import { FolderIcon, Tree } from "@dust-tt/sparkle";
import type {
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
  WorkspaceType,
} from "@dust-tt/types";
import { defaultSelectionConfiguration } from "@dust-tt/types";
import _ from "lodash";
import type { Dispatch, SetStateAction } from "react";
import { useMemo } from "react";

import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import { useParentResourcesById } from "@app/hooks/useParentResourcesById";
import {
  CONNECTOR_CONFIGURATIONS,
  getConnectorProviderLogoWithFallback,
} from "@app/lib/connector_providers";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";

export function DataSourceViewSelector({
  owner,
  selectionConfiguration,
  setSelectionConfigurations: setSelectedNodes,
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
      setSelectedNodes((prevState: DataSourceViewSelectionConfigurations) => {
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
      });
    };
  }, [dataSourceView, setParentsById, setSelectedNodes]);

  return (
    <Tree.Item
      key={dataSourceView.dataSource.name}
      label={getDisplayNameForDataSource(dataSourceView.dataSource)}
      visual={LogoComponent}
      type="node"
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
          setSelectedNodes(
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
