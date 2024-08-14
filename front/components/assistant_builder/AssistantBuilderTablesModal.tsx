import {
  Button,
  GlobeAltIcon,
  Item,
  Modal,
  Page,
  Searchbar,
  ServerIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  ContentNode,
  CoreAPITable,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  canContainStructuredData,
  getMicrosoftSheetContentNodeInternalIdFromTableId,
} from "@dust-tt/types";
import {
  getGoogleSheetContentNodeInternalIdFromTableId,
  getNotionDatabaseContentNodeInternalIdFromTableId,
  getTableIdForContentNode,
} from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import type { AssistantBuilderTableConfiguration } from "@app/components/assistant_builder/types";
import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import { orderDatasourceByImportance } from "@app/lib/assistant";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { useDataSourceNodes, useTables } from "@app/lib/swr";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";

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
          <PickDataSource
            dataSources={supportedDataSources}
            onPick={(ds: DataSourceType) => {
              setSelectedDataSource(ds);
            }}
          />
        ) : !selectedDataSource.connectorId ? (
          <PickTable
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

function PickDataSource({
  dataSources,
  onPick,
}: {
  dataSources: DataSourceType[];
  onPick: (dataSource: DataSourceType) => void;
}) {
  const [query, setQuery] = useState<string>("");

  const filtered = dataSources.filter((ds) => {
    return subFilter(query.toLowerCase(), ds.name.toLowerCase());
  });

  return (
    <Transition show={true} className="mx-auto max-w-6xl">
      <Page>
        <Page.Header title="Select a Table in" icon={ServerIcon} />
        <Searchbar
          name="search"
          onChange={setQuery}
          value={query}
          placeholder="Search..."
        />
        {orderDatasourceByImportance(filtered).map((ds) => (
          <Item.Navigation
            label={getDisplayNameForDataSource(ds)}
            icon={
              ds.connectorProvider
                ? CONNECTOR_CONFIGURATIONS[ds.connectorProvider].logoComponent
                : GlobeAltIcon
            }
            key={ds.id}
            onClick={() => {
              onPick(ds);
            }}
          />
        ))}
      </Page>
    </Transition>
  );
}

const PickTable = ({
  owner,
  dataSource,
  onPick,
  onBack,
  tablesQueryConfiguration,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  onPick: (table: CoreAPITable) => void;
  onBack?: () => void;
  tablesQueryConfiguration: Record<string, AssistantBuilderTableConfiguration>;
}) => {
  const { tables } = useTables({
    workspaceId: owner.sId,
    dataSourceName: dataSource.name,
  });
  const [query, setQuery] = useState<string>("");

  const tablesToDisplay = tables.filter(
    (t) =>
      !tablesQueryConfiguration?.[
        `${owner.sId}/${dataSource.name}/${t.table_id}`
      ]
  );
  const filtered = useMemo(
    () =>
      tablesToDisplay.filter((t) => {
        return subFilter(query.toLowerCase(), t.name.toLowerCase());
      }),
    [query, tablesToDisplay]
  );

  const isAllSelected = !!tables.length && !tablesToDisplay.length;

  return (
    <Transition show={true} className="mx-auto max-w-6xl">
      <Page>
        <Page.Header title="Select a Table" icon={ServerIcon} />
        {isAllSelected && (
          <div className="flex h-full w-full flex-col">
            <div className="text-gray-500">
              All tables from this DataSource are already selected.
            </div>
          </div>
        )}

        {tables.length === 0 && (
          <div className="flex h-full w-full flex-col">
            <div className="text-gray-500">
              No tables found in this Data Source.
            </div>
          </div>
        )}

        {!!tablesToDisplay.length && (
          <>
            <Searchbar
              name="search"
              onChange={setQuery}
              value={query}
              placeholder="Search..."
            />
            {filtered
              .sort((a, b) => compareForFuzzySort(query, a.name, b.name))
              .map((table) => {
                return (
                  <Item.Navigation
                    label={table.name}
                    icon={
                      dataSource.connectorProvider
                        ? CONNECTOR_CONFIGURATIONS[dataSource.connectorProvider]
                            .logoComponent
                        : ServerIcon
                    }
                    key={`${table.data_source_id}/${table.table_id}`}
                    onClick={() => {
                      onPick(table);
                    }}
                  />
                );
              })}
          </>
        )}

        <div className="flex pt-8">
          <Button label="Back" onClick={onBack} variant="secondary" />
        </div>
      </Page>
    </Transition>
  );
};

const PickTablesManaged = ({
  owner,
  dataSource,
  onSelectionChange,
  selectedNodes,
  parentsById,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  onSelectionChange: (
    resource: ContentNode,
    parents: string[],
    selected: boolean
  ) => void;
  onBack?: () => void;
  selectedNodes: ContentNode[];
  parentsById: Record<string, Set<string>>;
}) => {
  return (
    <Transition show={true} className="mx-auto max-w-6xl">
      <Page>
        <Page.Header title="Select a Table" icon={ServerIcon} />
        <DataSourceResourceSelectorTree
          owner={owner}
          dataSource={dataSource}
          showExpand={true}
          selectedResourceIds={
            selectedNodes
              ? [...new Set(selectedNodes.map((n) => n.internalId))]
              : []
          }
          selectedParents={[
            ...new Set(Object.values(parentsById).flatMap((c) => [...c])),
          ]}
          filterPermission="read"
          viewType={"tables"}
          onSelectChange={onSelectionChange}
        />
      </Page>
    </Transition>
  );
};
