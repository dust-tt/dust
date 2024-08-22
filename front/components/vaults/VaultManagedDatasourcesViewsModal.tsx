import { Modal, Tree } from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  DataSourceViewType,
  ManagedDataSourceViewsSelectedNodes,
  WorkspaceType,
} from "@dust-tt/types";
import { useState } from "react";

import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import { useParentResourcesById } from "@app/hooks/useParentResourcesById";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";

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
        name: ds.name,
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
                  key={dataSourceView.name}
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
      dataSourceView.connectorProvider as ConnectorProvider
    ];
  const LogoComponent = config?.logoComponent ?? null;
  const selectedNodesInDataSourceView = selectedNodes.find(
    (ds) => ds.name === dataSourceView.name
  );

  // TODO(GROUPS_INFRA): useParentResourcesById should use views not data sources.
  const { parentsById, setParentsById } = useParentResourcesById({
    owner,
    dataSource: dataSourceView,
    internalIds: selectedNodesInDataSourceView?.parentsIn ?? [],
  });

  const selectedParents = [
    ...new Set(Object.values(parentsById).flatMap((c) => [...c])),
  ];

  const isSelectAll = selectedNodesInDataSourceView?.parentsIn === null;
  const isPartiallyChecked = !!(
    selectedNodesInDataSourceView?.parentsIn?.length &&
    selectedNodesInDataSourceView?.parentsIn?.length > 0
  );

  return (
    <Tree.Item
      key={dataSourceView.name}
      label={config?.name}
      visual={LogoComponent ? <LogoComponent className="s-h-5 s-w-5" /> : null}
      variant="folder"
      type="node"
      checkbox={{
        checked: isSelectAll,
        partialChecked: isPartiallyChecked,
        onChange: (checked) => {
          if (!hasChanged) {
            setHasChanged(true);
          }

          // Setting parentsById
          setParentsById({});

          // Setting selectedResources
          setSelectedNodes((prevState) => {
            const existingDs = prevState.find(
              (ds) => ds.name === dataSourceView.name
            );

            if (checked) {
              if (existingDs) {
                existingDs.parentsIn = null; // null means select all.
              } else {
                prevState.push({
                  name: dataSourceView.name,
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
        dataSource={dataSourceView}
        showExpand={
          CONNECTOR_CONFIGURATIONS[
            dataSourceView.connectorProvider as ConnectorProvider
          ]?.isNested
        }
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
              const ds = prevState.find(
                (ds) => ds.name === dataSourceView.name
              );
              if (ds) {
                if (ds.parentsIn === null) {
                  ds.parentsIn = [node.internalId];
                } else {
                  ds.parentsIn.push(node.internalId);
                }
              } else {
                prevState.push({
                  name: dataSourceView.name,
                  parentsIn: [node.internalId],
                });
              }
              return prevState;
            }

            const ds = prevState.find((ds) => ds.name === dataSourceView.name);
            if (ds && ds.parentsIn) {
              ds.parentsIn = ds.parentsIn.filter(
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
