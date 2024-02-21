import {
  Button,
  CloudArrowDownIcon,
  Item,
  Modal,
  Page,
  Searchbar,
  ServerIcon,
} from "@dust-tt/sparkle";
import type { CoreAPITable, DataSourceType } from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import * as React from "react";
import { useMemo, useState } from "react";

import type { AssistantBuilderTableConfiguration } from "@app/components/assistant_builder/types";
import { orderDatasourceByImportance } from "@app/lib/assistant";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { useTables } from "@app/lib/swr";
import { subFilter } from "@app/lib/utils";

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
  onSave: (params: AssistantBuilderTableConfiguration) => void;
  owner: WorkspaceType;
  dataSources: DataSourceType[];
  tablesQueryConfiguration: Record<string, AssistantBuilderTableConfiguration>;
}) {
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSourceType | null>(null);

  const [selectedTable, setSelectedTable] =
    useState<AssistantBuilderTableConfiguration | null>(null);

  const onClose = () => {
    setOpen(false);
    setTimeout(() => {
      setSelectedDataSource(null);
      setSelectedTable(null);
    }, 200);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onSave={() => {
        if (selectedTable) {
          onSave(selectedTable);
        }
      }}
      hasChanged={!!selectedTable}
      variant="full-screen"
      title="Select Tables"
    >
      <div className="w-full pt-12">
        {!selectedDataSource ? (
          <PickDataSource
            dataSources={dataSources}
            onPick={(ds: DataSourceType) => {
              setSelectedDataSource(ds);
            }}
          />
        ) : (
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
              setSelectedTable(config);
              onSave(config);
              onClose();
            }}
            onBack={() => {
              setSelectedDataSource(null);
            }}
            tablesQueryConfiguration={tablesQueryConfiguration}
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
              .sort((a, b) => (b.name ? 1 : 0) - (a.name ? 1 : 0))
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
