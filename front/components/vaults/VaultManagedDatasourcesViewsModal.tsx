import { Modal, Tree } from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  DataSourceViewType,
  ManagedDataSourceViewSelectedNode,
  ManagedDataSourceViewsSelectedNodes,
  WorkspaceType,
} from "@dust-tt/types";
import { useState } from "react";

import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import { useParentResourcesById } from "@app/hooks/useParentResourcesById";
import {
  CONNECTOR_CONFIGURATIONS,
  getConnectorProviderLogo,
} from "@app/lib/connector_providers";

export default function VaultManagedDataSourcesViewsModal({
  isOpen,
  setOpen,
  owner,
  systemVaultDataSourceViews,
  onSave,
  initialSelectedDataSources,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  owner: WorkspaceType;
  systemVaultDataSourceViews: DataSourceViewType[];
  onSave: (dsConfigs: ManagedDataSourceViewsSelectedNodes) => void;
  initialSelectedDataSources: DataSourceViewType[];
}) {
  const [selectedNodes, setSelectedNodes] =
    useState<ManagedDataSourceViewsSelectedNodes>(
      initialSelectedDataSources.map((ds) => ({
        name: ds.dataSource.name,
        parentsIn: ds.parentsIn ?? null,
      }))
    );
  const [hasChanged, setHasChanged] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setOpen(false);
      }}
      onSave={() => {
        onSave(selectedNodes);
        setOpen(false);
      }}
      hasChanged={hasChanged}
      variant="side-md"
      title="Add connected datasources"
    >
      <div className="w-full pt-12">
        <div className="overflow-x-auto">
          <Tree isLoading={false}>
            {systemVaultDataSourceViews.map((dataSourceView) => {
              return (
                <VaultManagedDataSourceViewsTree
                  key={dataSourceView.dataSource.name}
                  owner={owner}
                  dataSourceView={dataSourceView}
                  selectedNodes={selectedNodes}
                  setSelectedNodes={setSelectedNodes}
                  hasChanged={hasChanged}
                  setHasChanged={setHasChanged}
                />
              );
            })}
          </Tree>
        </div>
      </div>
    </Modal>
  );
}

function getCheckedStatus(node: ManagedDataSourceViewSelectedNode | undefined) {
  if (!node) {
    return "unchecked";
  }

  const { parentsIn } = node;

  const isSelectAll = parentsIn === null;
  const isPartiallyChecked = !!(parentsIn?.length && parentsIn?.length > 0);

  if (isSelectAll) {
    return "checked";
  }

  return isPartiallyChecked ? "partial" : "unchecked";
}

function VaultManagedDataSourceViewsTree({
  owner,
  dataSourceView,
  selectedNodes,
  setSelectedNodes,
  hasChanged,
  setHasChanged,
}: {
  owner: WorkspaceType;
  dataSourceView: DataSourceViewType;
  selectedNodes: ManagedDataSourceViewsSelectedNodes;
  setSelectedNodes: (
    prevState: (
      prevState: ManagedDataSourceViewsSelectedNodes
    ) => ManagedDataSourceViewsSelectedNodes
  ) => void;
  hasChanged: boolean;
  setHasChanged: (hasChanged: boolean) => void;
}) {
  const config =
    CONNECTOR_CONFIGURATIONS[
      dataSourceView.dataSource.connectorProvider as ConnectorProvider
    ];
  const LogoComponent = getConnectorProviderLogo(
    dataSourceView.dataSource.connectorProvider
  );
  const selectedNodesInDataSourceView = selectedNodes.find(
    (ds) => ds.name === dataSourceView.dataSource.name
  );

  // TODO(GROUPS_INFRA): useParentResourcesById should use views not data sources.
  const { parentsById, setParentsById } = useParentResourcesById({
    owner,
    dataSource: dataSourceView.dataSource,
    internalIds: selectedNodesInDataSourceView?.parentsIn ?? [],
  });

  const selectedParents = [
    ...new Set(Object.values(parentsById).flatMap((c) => [...c])),
  ];

  const isSelectAll = selectedNodesInDataSourceView?.parentsIn === null;

  return (
    <Tree.Item
      key={dataSourceView.dataSource.name}
      label={config?.name}
      visual={LogoComponent ?? undefined}
      type="node"
      checkbox={{
        checked: getCheckedStatus(selectedNodesInDataSourceView),
        onChange: (checked) => {
          if (!hasChanged) {
            setHasChanged(true);
          }

          // Setting parentsById
          setParentsById({});

          // Setting selectedResources
          setSelectedNodes((prevState) => {
            const existingDs = prevState.find(
              (ds) => ds.name === dataSourceView.dataSource.name
            );

            if (checked) {
              if (existingDs) {
                existingDs.parentsIn = null; // null means select all.
              } else {
                prevState.push({
                  name: dataSourceView.dataSource.name,
                  parentsIn: null, // null means select all.
                });
              }
              return prevState;
            }

            if (existingDs) {
              existingDs.parentsIn = []; // Empty array means select none.
            }
            return prevState;
          });
        },
      }}
    >
      <DataSourceResourceSelectorTree
        owner={owner}
        dataSourceView={dataSourceView}
        showExpand={config.isNested}
        selectedResourceIds={selectedNodesInDataSourceView?.parentsIn ?? []}
        selectedParents={selectedParents}
        onSelectChange={(node, parents, selected) => {
          if (!hasChanged) {
            setHasChanged(true);
          }

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
          setSelectedNodes((prevState: ManagedDataSourceViewsSelectedNodes) => {
            if (selected) {
              const dsv = prevState.find(
                (v) => v.name === dataSourceView.dataSource.name
              );
              if (dsv) {
                if (dsv.parentsIn === null) {
                  dsv.parentsIn = [node.internalId];
                } else {
                  dsv.parentsIn.push(node.internalId);
                }
              } else {
                prevState.push({
                  name: dataSourceView.dataSource.name,
                  parentsIn: [node.internalId],
                });
              }
              return prevState;
            }

            const dsv = prevState.find(
              (v) => v.name === dataSourceView.dataSource.name
            );
            if (dsv && dsv.parentsIn) {
              dsv.parentsIn = dsv.parentsIn.filter(
                (id) => id !== node.internalId
              );
            }
            return prevState;
          });
        }}
        parentIsSelected={isSelectAll}
      />
    </Tree.Item>
  );
}
