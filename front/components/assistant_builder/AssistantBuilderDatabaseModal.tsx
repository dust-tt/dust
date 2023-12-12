import {
  Button,
  CloudArrowDownIcon,
  Item,
  Modal,
  Page,
  ServerIcon,
} from "@dust-tt/sparkle";
import { CoreAPIDatabase, DataSourceType } from "@dust-tt/types";
import { WorkspaceType } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import type * as React from "react";
import { useEffect, useState } from "react";

import { AssistantBuilderDatabaseQueryConfiguration } from "@app/components/assistant_builder/AssistantBuilder";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { useDatabases } from "@app/lib/swr";

export default function AssistantBuilderDataBaseModal({
  isOpen,
  setOpen,
  onSave,
  owner,
  dataSources,
  currentDatabase,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  onSave: (params: AssistantBuilderDatabaseQueryConfiguration | null) => void;
  owner: WorkspaceType;
  dataSources: DataSourceType[];
  currentDatabase: AssistantBuilderDatabaseQueryConfiguration | null;
}) {
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSourceType | null>(null);

  const [selectedDatabase, setSelectedDatabase] =
    useState<AssistantBuilderDatabaseQueryConfiguration | null>(null);

  useEffect(() => {
    if (currentDatabase) {
      setSelectedDatabase(currentDatabase);
    }
  }, [currentDatabase]);

  const onClose = () => {
    setOpen(false);
    setTimeout(() => {
      setSelectedDataSource(null);
      setSelectedDatabase(null);
    }, 200);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onSave={() => onSave(selectedDatabase)}
      hasChanged={currentDatabase?.databaseId !== selectedDatabase?.databaseId}
      variant="full-screen"
      title="Select a Database"
    >
      <div className="w-full pt-12">
        {!selectedDataSource ? (
          <PickDataSource
            dataSources={dataSources}
            show={!currentDatabase}
            onPick={(ds: DataSourceType) => {
              setSelectedDataSource(ds);
            }}
          />
        ) : (
          <PickDataBase
            owner={owner}
            dataSource={selectedDataSource}
            show={!currentDatabase}
            onPick={(database: CoreAPIDatabase) => {
              setSelectedDatabase({
                dataSourceWorkspaceId: owner.sId,
                dataSourceId: database.data_source_id,
                databaseId: database.database_id,
                databaseName: database.name,
              });
              onSave({
                dataSourceWorkspaceId: owner.sId,
                dataSourceId: database.data_source_id,
                databaseId: database.database_id,
                databaseName: database.name,
              });
              onClose();
            }}
            onBack={() => {
              setSelectedDataSource(null);
            }}
          />
        )}
      </div>
    </Modal>
  );
}

function PickDataSource({
  dataSources,
  show,
  onPick,
}: {
  dataSources: DataSourceType[];
  show: boolean;
  onPick: (dataSource: DataSourceType) => void;
}) {
  return (
    <Transition show={show} className="mx-auto max-w-6xl">
      <Page>
        <Page.Header
          title="Select a Database in your Data sources"
          icon={ServerIcon}
        />

        {dataSources
          .sort(
            (a, b) =>
              (b.connectorProvider ? 1 : 0) - (a.connectorProvider ? 1 : 0)
          )
          .map((ds) => {
            return (
              <Item.Navigation
                label={
                  ds.connectorProvider
                    ? CONNECTOR_CONFIGURATIONS[ds.connectorProvider].name
                    : ds.name
                }
                icon={
                  ds.connectorProvider
                    ? CONNECTOR_CONFIGURATIONS[ds.connectorProvider]
                        .logoComponent
                    : CloudArrowDownIcon
                }
                key={ds.name}
                onClick={() => {
                  onPick(ds);
                }}
              />
            );
          })}
      </Page>
    </Transition>
  );
}

const PickDataBase = ({
  owner,
  dataSource,
  show,
  onPick,
  onBack,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  show: boolean;
  onPick: (database: CoreAPIDatabase) => void;
  onBack?: () => void;
}) => {
  const { databases } = useDatabases({
    workspaceId: owner.sId,
    dataSourceName: dataSource.name,
    offset: 0,
    limit: 100,
  });

  return (
    <Transition show={show} className="mx-auto max-w-6xl">
      <Page>
        <Page.Header
          title="Select a Database in your Data Sources"
          icon={ServerIcon}
        />

        {databases.length === 0 && (
          <div className="flex h-full w-full flex-col">
            <div className=" text-gray-500">
              No database found in this Data Source.
            </div>
          </div>
        )}

        {databases.length > 0 &&
          databases
            .sort((a, b) => (b.name ? 1 : 0) - (a.name ? 1 : 0))
            .map((database) => {
              return (
                <Item.Navigation
                  label={database.name}
                  icon={
                    dataSource.connectorProvider
                      ? CONNECTOR_CONFIGURATIONS[dataSource.connectorProvider]
                          .logoComponent
                      : ServerIcon
                  }
                  key={dataSource.name}
                  onClick={() => {
                    onPick(database);
                  }}
                />
              );
            })}

        <div className="flex pt-8">
          <Button label="Back" onClick={onBack} variant="secondary" />
        </div>
      </Page>
    </Transition>
  );
};
