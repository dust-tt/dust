import {
  ArrowUpOnSquareIcon,
  Button,
  CloudArrowLeftRightIcon,
  ContextItem,
  DocumentPileIcon,
  Input,
  Item,
  Modal,
  Page,
  SectionHeader,
} from "@dust-tt/sparkle";
import { DataSourceType, UserType, WorkspaceType } from "@dust-tt/types";
import { SubscriptionType } from "@dust-tt/types";
import { CoreAPIDatabase } from "@dust-tt/types";
import { PlusIcon } from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import React, { useContext, useRef } from "react";
import { useSWRConfig } from "swr";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { useDatabases, useDatabaseTables } from "@app/lib/swr";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  owner: WorkspaceType;
  user: UserType;
  subscription: SubscriptionType;
  dataSources: DataSourceType[];
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (
    !owner ||
    !auth.isBuilder() ||
    !isDevelopmentOrDustWorkspace(owner) ||
    !subscription ||
    !user
  ) {
    return {
      notFound: true,
    };
  }

  const datasources = await getDataSources(auth);

  return {
    props: {
      user,
      owner,
      subscription,
      dataSources: datasources,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function AppDatabases({
  user,
  owner,
  dataSources,
  subscription,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [selectedDatabase, setSelectedDatabase] =
    React.useState<CoreAPIDatabase | null>(null);
  const [selectedDataSource, setSelectedDataSource] =
    React.useState<DataSourceType | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const onModalClose = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setSelectedDatabase(null);
      setSelectedDataSource(null);
    }, 500);
  };

  const dbsByDs: Record<string, CoreAPIDatabase[]> = {};
  for (const ds of dataSources) {
    const { databases } = useDatabases({
      workspaceId: owner.sId,
      dataSourceName: ds.name,
      offset: 0,
      limit: 100,
    });
    if (databases) {
      dbsByDs[ds.name] = databases;
    }
  }

  // order by those that have the most databases
  const entries = Object.entries(dbsByDs)
    .sort(([, a], [, b]) => b.length - a.length)
    .filter(
      // remove managed data sources that don't have any databases
      ([dsName, dbs]) =>
        dbs.length > 0 ||
        !dataSources.find((ds) => ds.name === dsName)?.connectorProvider
    );

  return (
    <AppLayout
      subscription={subscription}
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "databases" })}
    >
      <DatabaseModal
        onClose={onModalClose}
        isOpen={isModalOpen}
        database={selectedDatabase}
        dataSource={selectedDataSource}
        workspaceId={owner.sId}
      />
      <Page.Header
        title="Databases"
        icon={ArrowUpOnSquareIcon}
        description="Databases are used to store structured data."
      />

      <div>
        <SectionHeader
          title="Your worskpace's databases"
          description="Below are the databases that are available in your workspace in each datasource."
        />
        <div className="mt-8">
          {entries.map(([dsName, dbs]) => {
            const ds = dataSources.find((ds) => ds.name === dsName);
            if (!ds) {
              return null;
            }
            return (
              <div key={dsName}>
                <div className="flex flex-row space-x-4 pt-8">
                  <ContextItem
                    key={dsName}
                    title={dsName}
                    action={
                      !ds.connectorProvider ? (
                        <Button
                          icon={PlusIcon}
                          labelVisible={false}
                          label={"Add database"}
                          size="xs"
                          variant="secondary"
                          onClick={() => {
                            setSelectedDataSource(ds);
                            setIsModalOpen(true);
                          }}
                        />
                      ) : null
                    }
                    visual={
                      <ContextItem.Visual
                        visual={
                          ds.connectorProvider
                            ? CloudArrowLeftRightIcon
                            : DocumentPileIcon
                        }
                      />
                    }
                  />
                </div>

                <div className="mt-4">
                  {dbs.map((db) => {
                    return (
                      <div key={`${dsName}-${db.name}`}>
                        <Item
                          label={db.name}
                          style="action"
                          onClick={() => {
                            setSelectedDatabase(db);
                            setSelectedDataSource(ds);
                            setIsModalOpen(true);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}

function DatabaseModal({
  isOpen,
  onClose,
  database,
  dataSource,
  workspaceId,
}: {
  isOpen: boolean;
  onClose: () => void;
  database: CoreAPIDatabase | null;
  dataSource: DataSourceType | null;
  workspaceId: string;
}) {
  const { mutate } = useSWRConfig();

  if (!dataSource) {
    return null;
  }

  const { tables } = useDatabaseTables({
    workspaceId,
    dataSourceName: dataSource.name,
    databaseId: database?.database_id,
  });

  const [name, setName] = React.useState("");
  const [editedDescriptionByTableId, setEditedDescriptionByTableId] =
    React.useState<Record<string, string>>({});
  const [newTableDescription, setNewTableDescription] = React.useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setName("");
    setEditedDescriptionByTableId({});
    onClose();
  };

  // Not empty, only alphanumeric, and not too long
  const isNameValid = () => name !== "" && /^[a-zA-Z0-9_]{1,32}$/.test(name);

  const sendNotification = useContext(SendNotificationsContext);

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      hasChanged={false}
      variant="side-md"
      title={database ? "Edit database" : "Create database"}
    >
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e?.target?.files?.[0];
          if (!file) return;
          if (file.size > 5_000_000) {
            // TODO handle ?
            sendNotification({
              type: "error",
              title: "File too large",
              description: "Please upload a file smaller than 5MB.",
            });
            return;
          }
          if (file.type !== "text/csv") {
            sendNotification({
              type: "error",
              title: "Invalid file type",
              description: "Please upload a CSV file.",
            });
            return;
          }

          const res = await handleFileUploadToText(file);
          if (res.isErr()) {
            sendNotification({
              type: "error",
              title: "Error uploading file",
              description: `An unexpected error occured: ${res.error}.`,
            });
            return;
          }
          const { content } = res.value;
          if (res.value.content.length > 1_000_000) {
            sendNotification({
              type: "error",
              title: "File too large",
              description:
                "Please upload a file containing less than 1 million characters.",
            });
            return;
          }

          const uploadRes = await fetch(
            `/api/w/${workspaceId}/data_sources/${dataSource.name}/databases/csv`,
            {
              method: "POST",
              body: JSON.stringify({
                name: name,
                description: newTableDescription,
                csv: content,
              }),
              headers: {
                "Content-Type": "application/json",
              },
            }
          );

          if (!uploadRes.ok) {
            sendNotification({
              type: "error",
              title: "Error uploading file",
              description: `An error occured: ${await uploadRes.text()}.`,
            });
            return;
          }

          await mutate(
            `/api/w/${workspaceId}/data_sources/${dataSource.name}/databases?offset=0&limit=100`
          );

          close();
        }}
      />

      <div className="mx-auto flex max-w-2xl flex-col">
        <div className="w-full pt-12">
          <div className="flex flex-col gap-4 px-2">
            <div className="text-lg font-bold text-element-900">Name</div>
            {database ? (
              <div className="text-lg text-element-700">{database.name}</div>
            ) : (
              <Input
                name="name"
                placeholder="Name"
                value={name}
                onChange={(v) => {
                  setName(v);
                }}
                className="w-full"
                error={isNameValid() ? null : "Invalid name"}
              />
            )}
            {!database && (
              <Input
                name="description"
                placeholder="Description"
                className="w-full"
                value={newTableDescription}
                onChange={(v) => {
                  setNewTableDescription(v);
                }}
                error={newTableDescription.length === 0 ? "Required" : null}
              />
            )}
          </div>
        </div>
        {database && tables && (
          <div className="w-full pt-12">
            <div className="flex flex-col gap-4 px-2">
              <div className="text-lg font-bold text-element-900">Tables</div>
              {tables.map((t) => {
                const editedDescription =
                  editedDescriptionByTableId[t.table_id];
                return (
                  <div
                    className="flex flex-col gap-2 text-lg text-element-700"
                    key={t.table_id}
                  >
                    {t.name}
                    <Input
                      name="description"
                      placeholder="Description"
                      className="w-full"
                      value={editedDescription ?? t.description}
                      onChange={(v) => {
                        setEditedDescriptionByTableId({
                          ...editedDescriptionByTableId,
                          [t.table_id]: v,
                        });
                      }}
                      error={
                        editedDescription?.length === 0 ? "Required" : null
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="pl-2 pt-2">
          {!database && (
            <Button
              label={"Upload CSV"}
              size="xs"
              disabled={!isNameValid() || newTableDescription === ""}
              onClick={() => fileInputRef.current?.click()}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
