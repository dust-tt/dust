import { Modal, Spinner } from "@dust-tt/sparkle";
import type {
  CoreAPITable,
  DataSourceViewType,
  LightContentNode,
  WorkspaceType,
} from "@dust-tt/types";
import {
  getGoogleSheetContentNodeInternalIdFromTableId,
  getMicrosoftSheetContentNodeInternalIdFromTableId,
  getNotionDatabaseContentNodeInternalIdFromTableId,
} from "@dust-tt/types";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";

import PickDataSourceForTable from "@app/components/assistant_builder/PickDataSourceForTable";
import { PickTableInFolder } from "@app/components/assistant_builder/PickTableInFolder";
import { PickTablesManaged } from "@app/components/assistant_builder/PickTablesManaged";
import { getTableIdForContentNode } from "@app/components/assistant_builder/shared";
import type { AssistantBuilderTableConfiguration } from "@app/components/assistant_builder/types";
import { isFolder } from "@app/lib/data_sources";
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
    dataSourceView: DataSourceViewType
  ) => void;
  owner: WorkspaceType;
  tablesQueryConfiguration: Record<string, AssistantBuilderTableConfiguration>;
}) {
  const [selectedDataSourceView, setSelectedDataSourceOrView] =
    useState<DataSourceViewType | null>(null);

  const [internalIds, setInternalIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const loadedInternalIds = useMemo(() => {
    if (!selectedDataSourceView?.dataSource.connectorId) {
      return [];
    }

    const tableConfigs = Object.values(tablesQueryConfiguration).filter(
      (c) => c.dataSourceId === selectedDataSourceView.dataSource.name
    );
    return tableConfigs.map((c) => {
      switch (selectedDataSourceView.dataSource.connectorProvider) {
        case "google_drive":
          return getGoogleSheetContentNodeInternalIdFromTableId(c.tableId);
        case "notion":
          return getNotionDatabaseContentNodeInternalIdFromTableId(c.tableId);
        case "microsoft":
          return getMicrosoftSheetContentNodeInternalIdFromTableId(c.tableId);
        default:
          throw new Error(
            `Unsupported connector provider: ${selectedDataSourceView.dataSource.connectorProvider}`
          );
      }
    });
  }, [selectedDataSourceView, tablesQueryConfiguration]);

  useEffect(() => {
    setInternalIds(loadedInternalIds);
  }, [loadedInternalIds]);

  const key = selectedDataSourceView
    ? {
        workspaceId: owner.sId,
        dataSourceName: selectedDataSourceView.dataSource.name,
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

  const onManagedSelectionChange = useMemo(
    () =>
      (
        dataSourceView: DataSourceViewType,
        previousNodes: LightContentNode[],
        node: LightContentNode,
        parents: string[],
        selected: boolean
      ) => {
        setInternalIds((internalIds) => {
          const newIds = internalIds.filter((id) => id !== node.internalId);
          const newNodes = previousNodes.filter(
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
            dataSourceName: dataSourceView.dataSource.name,
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
      },
    [owner.sId, parentsById, serializeUseDataSourceKey]
  );

  async function save() {
    if (!selectedDataSourceView || !selectedManagedTables) {
      return;
    }
    setIsSaving(true);

    try {
      const tableIds = selectedManagedTables.map((n) =>
        getTableIdForContentNode(selectedDataSourceView.dataSource, n)
      );

      const tables = await Promise.all(
        tableIds.map(async (id) => {
          const tableRes = await fetch(
            `/api/w/${owner.sId}/data_sources/${selectedDataSourceView.dataSource.name}/tables/${id}`
          );
          // TODO(GROUPS_INFRA):  Move to data_source_views endpoint
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

      onSave(configs, selectedDataSourceView);
    } finally {
      setIsSaving(false);
    }
  }

  const onClose = (e?: Event, forceClose: boolean = false) => {
    if (selectedDataSourceView !== null && !forceClose) {
      setSelectedDataSourceOrView(null);
    } else {
      setOpen(false);
      setTimeout(() => {
        setSelectedDataSourceOrView(null);
        setIsSaving(false);
      }, 200);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isSaving={isSaving}
      onSave={() => {
        void save().then(() => onClose(undefined, true));
      }}
      hasChanged={loadedInternalIds !== internalIds}
      variant="full-screen"
      title="Select Tables"
    >
      <div className="w-full pt-12">
        {!selectedManagedTables ? (
          <Spinner />
        ) : !selectedDataSourceView ? (
          <PickDataSourceForTable
            onPick={(dsView: DataSourceViewType) => {
              setSelectedDataSourceOrView(dsView);
            }}
          />
        ) : isFolder(selectedDataSourceView.dataSource) ? (
          <PickTableInFolder
            owner={owner}
            dataSourceView={selectedDataSourceView}
            onPick={(table: CoreAPITable) => {
              const config = {
                workspaceId: owner.sId,
                dataSourceId: table.data_source_id,
                tableId: table.table_id,
                tableName: table.name,
              };
              onSave([config], selectedDataSourceView);
              onClose(undefined, true);
            }}
            onBack={() => {
              setSelectedDataSourceOrView(null);
            }}
            tablesQueryConfiguration={tablesQueryConfiguration}
          />
        ) : (
          selectedDataSourceView && (
            <PickTablesManaged
              owner={owner}
              dataSourceView={selectedDataSourceView}
              onSelectionChange={onManagedSelectionChange}
              selectedNodes={selectedManagedTables}
              onBack={() => {
                setSelectedDataSourceOrView(null);
              }}
              parentsById={parentsById}
            />
          )
        )}
      </div>
    </Modal>
  );
}
