import { Item, Modal, Page, ServerIcon } from "@dust-tt/sparkle";
import { CoreAPIDatabase, DataSourceType } from "@dust-tt/types";
import { WorkspaceType } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import type * as React from "react";
import { useEffect, useState } from "react";

import { AssistantBuilderDatabaseConfiguration } from "@app/components/assistant_builder/AssistantBuilder";
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
  onSave: (params: AssistantBuilderDatabaseConfiguration | null) => void;
  owner: WorkspaceType;
  dataSources: DataSourceType[];
  currentDatabase: AssistantBuilderDatabaseConfiguration | null;
}) {
  const [selectedDatabase, setSelectedDatabase] =
    useState<AssistantBuilderDatabaseConfiguration | null>(null);

  useEffect(() => {
    if (currentDatabase) {
      setSelectedDatabase(currentDatabase);
    }
  }, [currentDatabase]);

  const onClose = () => {
    setOpen(false);
    setTimeout(() => {
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
        <PickDatabase
          owner={owner}
          dataSources={dataSources}
          show={!currentDatabase}
          onPick={(database: CoreAPIDatabase) => {
            setSelectedDatabase({
              dataSourceId: database.data_source_id,
              databaseId: database.database_id,
              databaseName: database.name,
            });
            onSave({
              dataSourceId: database.data_source_id,
              databaseId: database.database_id,
              databaseName: database.name,
            });
            onClose();
          }}
        />
      </div>
    </Modal>
  );
}

function PickDatabase({
  owner,
  dataSources,
  show,
  onPick,
}: {
  owner: WorkspaceType;
  dataSources: DataSourceType[];
  show: boolean;
  onPick: (database: CoreAPIDatabase) => void;
}) {
  return (
    <Transition show={show} className="mx-auto max-w-6xl">
      <Page>
        <Page.Header title="Select a Database" icon={ServerIcon} />
        {dataSources
          .sort(
            (a, b) =>
              (b.connectorProvider ? 1 : 0) - (a.connectorProvider ? 1 : 0)
          )
          .map((ds) => {
            const { databases } = useDatabases({
              workspaceId: owner.sId,
              dataSourceName: ds.name,
              offset: 0,
              limit: 100,
            });

            if (!databases.length) {
              return null;
            }

            return databases.map((database) => {
              const dataSourceName = ds.connectorProvider
                ? CONNECTOR_CONFIGURATIONS[ds.connectorProvider].name
                : ds.name;
              const databaseName = database.name;
              return (
                <Item.Navigation
                  label={`${dataSourceName} > ${databaseName}`}
                  icon={
                    ds.connectorProvider
                      ? CONNECTOR_CONFIGURATIONS[ds.connectorProvider]
                          .logoComponent
                      : ServerIcon
                  }
                  key={ds.name}
                  onClick={() => {
                    onPick(database);
                  }}
                />
              );
            });
          })}
      </Page>
    </Transition>
  );
}
