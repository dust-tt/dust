import { Modal, Spinner } from "@dust-tt/sparkle";
import type {
  ContentNode,
  CoreAPITable,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  canContainStructuredData,
  getMicrosoftSheetContentNodeInternalIdFromTableId,
  isFolder,
} from "@dust-tt/types";
import {
  getGoogleSheetContentNodeInternalIdFromTableId,
  getNotionDatabaseContentNodeInternalIdFromTableId,
  getTableIdForContentNode,
} from "@dust-tt/types";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import PickDataSourceForTable from "@app/components/assistant_builder/PickDataSourceForTable";
import { PickTableInFolder } from "@app/components/assistant_builder/PickTableInFolder";
import { PickTablesManaged } from "@app/components/assistant_builder/PickTablesManaged";
import type { AssistantBuilderTableConfiguration } from "@app/components/assistant_builder/types";
import { useDataSourceNodes } from "@app/lib/swr";

export default function AssistantBuilderTablesModal({
  isOpen,
  setOpen,
  onSave,
  owner,
  tablesQueryConfiguration,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  onSave: (
    params: AssistantBuilderTableConfiguration[],
    dataSource: DataSourceType
  ) => void;
  owner: WorkspaceType;
  tablesQueryConfiguration: Record<string, AssistantBuilderTableConfiguration>;
}) {
  const { dataSources } = React.useContext(AssistantBuilderContext);

  const supportedDataSources = useMemo(
    () => dataSources.filter(canContainStructuredData),
    [dataSources]
  );

  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSourceType | null>(null);
  const [internalIds, setInternalIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const loadedInternalIds = useMemo(() => {
    if (!selectedDataSource || !selectedDataSource?.connectorId) {
      return [];
    }

    const tableConfigs = Object.values(tablesQueryConfiguration).filter(
      (c) => c.dataSourceId === selectedDataSource.name
    );
    return tableConfigs.map((c) => {
      switch (selectedDataSource.connectorProvider) {
        case "google_drive":
          return getGoogleSheetContentNodeInternalIdFromTableId(c.tableId);
        case "notion":
          return getNotionDatabaseContentNodeInternalIdFromTableId(c.tableId);
        case "microsoft":
          return getMicrosoftSheetContentNodeInternalIdFromTableId(c.tableId);
        default:
          throw new Error(
            `Unsupported connector provider: ${selectedDataSource.connectorProvider}`
          );
      }
    });
  }, [selectedDataSource, tablesQueryConfiguration]);

  useEffect(() => {
    setInternalIds(loadedInternalIds);
  }, [loadedInternalIds]);

  const key = selectedDataSource
    ? {
        workspaceId: owner.sId,
        dataSourceName: selectedDataSource.name,
        internalIds,
      }
    : {
        workspaceId: owner.sId,
        dataSourceName: "",
        internalIds: [],
      };

  const [fallback, setFallback] = useState({});
  const { nodes, serializeKey: serializeUseDataSourceKey } = useDataSourceNodes(
    key,
    {
      fallback,
    }
  );

  const selectedManagedTables = nodes.contentNodes;
  const parentsById = nodes.parentsById;

  async function save() {
    if (!selectedDataSource || !selectedManagedTables) {
      return;
    }
    setIsSaving(true);

    try {
      const tableIds = selectedManagedTables.map((n) =>
        getTableIdForContentNode(n)
      );

      const tables = await Promise.all(
        tableIds.map(async (id) => {
          const tableRes = await fetch(
            `/api/w/${owner.sId}/data_sources/${selectedDataSource.name}/tables/${id}`
          );
          const { table } = (await tableRes.json()) as { table: CoreAPITable };
          return table;
        })
      );
      const configs = tables.map((table) => ({
        workspaceId: owner.sId,
        dataSourceId: table.data_source_id,
        tableId: table.table_id,
        tableName: table.name,
      }));

      onSave(configs, selectedDataSource);
    } finally {
      setIsSaving(false);
    }
  }

  const onClose = () => {
    setOpen(false);
    setTimeout(() => {
      setSelectedDataSource(null);
      setIsSaving(false);
    }, 200);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isSaving={isSaving}
      onSave={() => {
        void save().then(onClose);
      }}
      hasChanged={loadedInternalIds !== internalIds}
      variant="full-screen"
      title="Select Tables"
    >
      <div className="w-full pt-12">
        {!selectedManagedTables ? (
          <Spinner />
        ) : !selectedDataSource ? (
          <PickDataSourceForTable
            dataSources={supportedDataSources}
            onPick={(ds: DataSourceType) => {
              setSelectedDataSource(ds);
            }}
          />
        ) : isFolder(selectedDataSource) ? (
          <PickTableInFolder
            owner={owner}
            dataSource={selectedDataSource}
            onPick={(table: CoreAPITable) => {
              const config = {
                workspaceId: owner.sId,
                dataSourceId: table.data_source_id,
                tableId: table.table_id,
                tableName: table.name,
              };
              onSave([config], selectedDataSource);
              onClose();
            }}
            onBack={() => {
              setSelectedDataSource(null);
            }}
            tablesQueryConfiguration={tablesQueryConfiguration}
          />
        ) : (
          <PickTablesManaged
            owner={owner}
            dataSource={selectedDataSource}
            onSelectionChange={(
              node: ContentNode,
              parents: string[],
              selected: boolean
            ) => {
              setInternalIds((internalIds) => {
                const newIds = internalIds.filter(
                  (id) => id !== node.internalId
                );
                const newNodes = selectedManagedTables.filter(
                  (n) => n.internalId !== node.internalId
                );
                const newParentsById = Object.entries(
                  parentsById as Record<string, Set<string>>
                ).reduce(
                  (acc, [key, value]) =>
                    key === node.internalId
                      ? acc
                      : {
                          ...acc,
                          [key]: value,
                        },
                  {} as Record<string, Set<string>>
                );

                if (selected) {
                  newIds.push(node.internalId);
                  newNodes.push(node);
                  newParentsById[node.internalId] = new Set(
                    // This is to get the same structure/order in the fallback as the endpoint return, from leaf to root, including leaf.
                    [...parents, node.internalId].reverse()
                  );
                }
                // Optimistic update
                const key = serializeUseDataSourceKey({
                  workspaceId: owner.sId,
                  dataSourceName: selectedDataSource.name,
                  internalIds: newIds,
                });
                setFallback((prev) => ({
                  ...prev,
                  [key]: {
                    contentNodes: newNodes,
                    parentsById: newParentsById,
                  },
                }));
                return newIds;
              });
            }}
            selectedNodes={selectedManagedTables}
            onBack={() => {
              setSelectedDataSource(null);
            }}
            parentsById={parentsById || {}}
          />
        )}
      </div>
    </Modal>
  );
}
