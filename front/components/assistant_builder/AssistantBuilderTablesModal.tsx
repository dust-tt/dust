import {
  Button,
  CloudArrowDownIcon,
  Item,
  Modal,
  Page,
  Searchbar,
  ServerIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type { ContentNode, WorkspaceType } from "@dust-tt/types";
import type {
  ConnectorProvider,
  CoreAPITable,
  DataSourceType,
} from "@dust-tt/types";
import {
  getGoogleSheetContentNodeInternalIdFromTableId,
  getNotionDatabaseContentNodeInternalIdFromTableId,
  getTableIdForContentNode,
} from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { AssistantBuilderTableConfiguration } from "@app/components/assistant_builder/types";
import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import { orderDatasourceByImportance } from "@app/lib/assistant";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { useTables } from "@app/lib/swr";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import type { GetContentNodeParentsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/managed/parents";

const STRUCTURED_DATA_SOURCES: ConnectorProvider[] = ["google_drive", "notion"];

const getContentNodes = async (
  workspaceSid: string,
  dataSourceName: string,
  internalIds: string[]
): Promise<ContentNode[]> => {
  const res = await fetch(
    `/api/w/${workspaceSid}/data_sources/${encodeURIComponent(
      dataSourceName
    )}/managed/content-nodes`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ internalIds }),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch content nodes: ${res.statusText}`);
  }

  const { contentNodes } = await res.json();

  return contentNodes;
};

// Returns a map where the keys are the internalIds passed and the values are the
// a set of internalIDs that are parents of the key.
const getParents = async (
  workspaceSid: string,
  dataSourceName: string,
  internalIds: string[]
): Promise<Record<string, Set<string>>> => {
  const res = await fetch(
    `/api/w/${workspaceSid}/data_sources/${encodeURIComponent(
      dataSourceName
    )}/managed/parents`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        internalIds,
      }),
    }
  );
  const json: GetContentNodeParentsResponseBody = await res.json();
  return json.nodes.reduce((acc, r) => {
    acc[r.internalId] = new Set(r.parents);
    return acc;
  }, {} as Record<string, Set<string>>);
};

export default function AssistantBuilderTablesModal({
  isOpen,
  setOpen,
  onSave,
  owner,
  dataSources,
  tablesQueryConfiguration,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  onSave: (params: AssistantBuilderTableConfiguration[]) => void;
  owner: WorkspaceType;
  dataSources: DataSourceType[];
  tablesQueryConfiguration: Record<string, AssistantBuilderTableConfiguration>;
}) {
  const supportedDataSources = useMemo(
    () =>
      dataSources.filter(
        (ds) =>
          // If there is no connectorProvider, it's a folder.
          ds.connectorProvider === null ||
          STRUCTURED_DATA_SOURCES.includes(ds.connectorProvider)
      ),
    [dataSources]
  );

  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSourceType | null>(null);

  const [selectedManagedTables, setSelectedManagedTables] = useState<
    ContentNode[]
  >([]);
  const [isSaving, setIsSaving] = useState(false);

  const [isInitializingNodes, setIsInitializingNodes] = useState(false);
  const [nodeIntializationError, setNodeIntializationError] =
    useState<boolean>(false);

  const [parentsById, setParentsById] = useState<Record<string, Set<string>>>(
    {}
  );
  const [isInitializingParents, setIsInitializingParents] = useState(false);
  const [parentsIntializationError, setParentsIntializationError] =
    useState<boolean>(false);

  const initializeManagedTables = useCallback(
    async (
      dataSource: DataSourceType,
      tableConfigs: AssistantBuilderTableConfiguration[]
    ) => {
      // const tableIds = tableConfigs.map((config) => config.tableId);
      const internalIds = tableConfigs.map((c) => {
        switch (dataSource.connectorProvider) {
          case "google_drive":
            return getGoogleSheetContentNodeInternalIdFromTableId(c.tableId);
          case "notion":
            return getNotionDatabaseContentNodeInternalIdFromTableId(c.tableId);
          default:
            throw new Error(
              `Unsupported connector provider: ${dataSource.connectorProvider}`
            );
        }
      });

      const contentNodes = await getContentNodes(
        owner.sId,
        dataSource.name,
        internalIds
      );

      if (contentNodes.length !== internalIds.length) {
        throw new Error(
          `Failed to fetch content nodes for all tables. Expected ${internalIds.length}, got ${contentNodes.length}.`
        );
      }

      setSelectedManagedTables((prev) => [
        ...prev.filter(
          (n) => !contentNodes.some((c) => c.internalId === n.internalId)
        ),
        ...contentNodes,
      ]);
    },
    [owner.sId, setSelectedManagedTables]
  );

  const initializeParents = useCallback(
    async (internalIds: string[], dataSource: DataSourceType) => {
      const parents = await getParents(owner.sId, dataSource.name, [
        ...internalIds,
      ]);
      setParentsById(parents);
    },
    [owner.sId]
  );

  useEffect(() => {
    // When coming back to the modal, if the user selects a data source that
    // is a connection and there are already tables selected, we need to
    // fetch the content nodes for those tables and add them to the selected
    // managed tables.

    const hasSelectedTables = !!Object.keys(tablesQueryConfiguration).length;
    const selectedDataSourceIsConnector = !!selectedDataSource?.connectorId;
    const hasExistingTablesQueryConfiguration = !!Object.keys(
      tablesQueryConfiguration
    ).length;

    if (
      !selectedDataSource ||
      !selectedDataSourceIsConnector ||
      isInitializingNodes ||
      hasSelectedTables ||
      !hasExistingTablesQueryConfiguration ||
      nodeIntializationError
    ) {
      return;
    }
    const tableConfigs = Object.values(tablesQueryConfiguration).filter(
      (c) => c.dataSourceId === selectedDataSource.name
    );
    if (!tableConfigs.length) {
      return;
    }
    setIsInitializingNodes(true);
    void initializeManagedTables(selectedDataSource, tableConfigs)
      .catch((e) => {
        setNodeIntializationError(true);
        throw e;
      })
      .finally(() => {
        setIsInitializingNodes(false);
      });
  }, [
    selectedDataSource,
    tablesQueryConfiguration,
    isInitializingNodes,
    selectedManagedTables.length,
    initializeManagedTables,
    nodeIntializationError,
  ]);

  useEffect(() => {
    if (
      !selectedDataSource ||
      !selectedDataSource.connectorId ||
      isInitializingParents ||
      !!parentsIntializationError ||
      !!Object.keys(parentsById).length ||
      !selectedManagedTables.length
    ) {
      return;
    }
    setIsInitializingParents(true);
    void initializeParents(
      selectedManagedTables.map((n) => n.internalId),
      selectedDataSource
    )
      .catch((e) => {
        setParentsIntializationError(true);
        throw e;
      })
      .finally(() => {
        setIsInitializingParents(false);
      });
  }, [
    selectedDataSource,
    selectedManagedTables,
    parentsById,
    initializeParents,
    isInitializingParents,
    parentsIntializationError,
  ]);

  async function save() {
    if (!selectedDataSource) {
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

      onSave(configs);
    } finally {
      setIsSaving(false);
    }
  }

  const onClose = () => {
    setOpen(false);
    setTimeout(() => {
      setSelectedDataSource(null);
      setSelectedManagedTables([]);
      setIsSaving(false);
      setIsInitializingNodes(false);
      setNodeIntializationError(false);
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
      hasChanged={!!selectedManagedTables.length}
      variant="full-screen"
      title="Select Tables"
    >
      <div className="w-full pt-12">
        {isInitializingNodes || isInitializingParents ? (
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
              onSave([config]);
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
              if (selected) {
                setParentsById({
                  ...parentsById,
                  [node.internalId]: new Set(parents),
                });
                setSelectedManagedTables([
                  ...selectedManagedTables.filter(
                    (r) => r.internalId !== node.internalId
                  ),
                  node,
                ]);
              } else {
                const newParentsById = { ...parentsById };
                delete newParentsById[node.internalId];
                setParentsById(newParentsById);
                setSelectedManagedTables(
                  selectedManagedTables.filter(
                    (n) => n.internalId !== node.internalId
                  )
                );
              }
            }}
            selectedNodes={selectedManagedTables}
            onBack={() => {
              setSelectedDataSource(null);
            }}
            parentsById={parentsById}
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
                : CloudArrowDownIcon
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
            <div className=" text-gray-500">
              All tables from this DataSource are already selected.
            </div>
          </div>
        )}

        {tables.length === 0 && (
          <div className="flex h-full w-full flex-col">
            <div className=" text-gray-500">
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
          expandable={true}
          selectedParentIds={new Set(selectedNodes.map((n) => n.internalId))}
          fullySelected={false}
          filterPermission="read"
          viewType={"tables"}
          onSelectChange={onSelectionChange}
          parentsById={parentsById}
        />
      </Page>
    </Transition>
  );
};
