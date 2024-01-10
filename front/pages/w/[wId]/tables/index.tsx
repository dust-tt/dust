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
} from "@dust-tt/sparkle";
import {
  CoreAPITable,
  DataSourceType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { SubscriptionType } from "@dust-tt/types";
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
import { isActivatedStructuredDB } from "@app/lib/development";
import { useTables } from "@app/lib/swr";

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
    !isActivatedStructuredDB(owner) ||
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
  const [selectedTable, setSelectedTable] = React.useState<CoreAPITable | null>(
    null
  );
  const [selectedDataSource, setSelectedDataSource] =
    React.useState<DataSourceType | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const onModalClose = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setSelectedTable(null);
      setSelectedDataSource(null);
    }, 500);
  };

  const tablesByDs: Record<string, CoreAPITable[]> = {};
  for (const ds of dataSources) {
    const { tables } = useTables({
      workspaceId: owner.sId,
      dataSourceName: ds.name,
    });
    if (tables) {
      tablesByDs[ds.name] = tables;
    }
  }

  // order by those that have the most databases
  const entries = Object.entries(tablesByDs)
    .sort(([, a], [, b]) => b.length - a.length)
    .filter(
      // remove managed data sources that don't have any databases
      ([dsName, tables]) =>
        tables.length > 0 ||
        !dataSources.find((ds) => ds.name === dsName)?.connectorProvider
    );

  return (
    <AppLayout
      subscription={subscription}
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="admin"
      subNavigation={subNavigationAdmin({ owner, current: "tables" })}
    >
      <TableModal
        onClose={onModalClose}
        isOpen={isModalOpen}
        table={selectedTable}
        dataSource={selectedDataSource}
        workspaceId={owner.sId}
      />
      <Page.Header
        title="Tables"
        icon={ArrowUpOnSquareIcon}
        description="Tables are used to store structured data."
      />

      <div>
        <Page.SectionHeader
          title="Your worskpace's tables"
          description="Below are the tables that are available in your workspace in each datasource."
        />
        <div className="mt-8">
          {entries.map(([dsName, tables]) => {
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
                          label={"Add table"}
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
                  {tables.map((table) => {
                    return (
                      <div key={`${dsName}-${table.name}`}>
                        <Item
                          label={table.name}
                          style="action"
                          onClick={() => {
                            setSelectedTable(table);
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

function TableModal({
  isOpen,
  onClose,
  table,
  dataSource,
  workspaceId,
}: {
  isOpen: boolean;
  onClose: () => void;
  table: CoreAPITable | null;
  dataSource: DataSourceType | null;
  workspaceId: string;
}) {
  const { mutate } = useSWRConfig();

  if (!dataSource) {
    return null;
  }

  const [name, setName] = React.useState("");
  const [editedTableDescription, setEditedTableDescription] = React.useState<
    string | null
  >(null);
  const [newTableDescription, setNewTableDescription] = React.useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setName("");
    setEditedTableDescription(null);
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
      title={table ? "Edit table" : "Create table"}
    >
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e?.target?.files?.[0];
          if (!file) return;
          if (file.size > 10_000_000) {
            // TODO handle ?
            sendNotification({
              type: "error",
              title: "File too large",
              description: "Please upload a file smaller than 10MB.",
            });
            return;
          }

          if (
            ![
              "text/csv",
              "text/tsv",
              "text/comma-separated-values",
              "text/tab-separated-values",
            ].includes(file.type)
          ) {
            sendNotification({
              type: "error",
              title: "Invalid file type",
              description: "Please upload a CSV or TSV file.",
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
          if (res.value.content.length > 10_000_000) {
            sendNotification({
              type: "error",
              title: "File too large",
              description:
                "Please upload a file containing less than 10 million characters.",
            });
            return;
          }

          const uploadRes = await fetch(
            `/api/w/${workspaceId}/data_sources/${dataSource.name}/tables/csv`,
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
            `/api/w/${workspaceId}/data_sources/${dataSource.name}/tables`
          );

          close();
        }}
      />

      <div className="mx-auto flex max-w-2xl flex-col">
        <div className="w-full pt-12">
          <div className="flex flex-col gap-4 px-2">
            <div className="text-lg font-bold text-element-900">Name</div>
            {table ? (
              <div className="text-lg text-element-700">{table.name}</div>
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
            {!table && (
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
        {table && (
          <div className="w-full pt-12">
            <div className="flex flex-col gap-4 px-2">
              <div className="text-lg font-bold text-element-900">Tables</div>
              <div className="flex flex-col gap-2 text-lg text-element-700">
                <Input
                  name="description"
                  placeholder="Description"
                  className="w-full"
                  value={editedTableDescription ?? table.description}
                  onChange={(v) => {
                    setEditedTableDescription(v);
                  }}
                  error={
                    editedTableDescription?.length === 0 ? "Required" : null
                  }
                />
              </div>
            </div>
          </div>
        )}
        <div className="pl-2 pt-2">
          {!table && (
            <Button
              label={"Upload CSV"}
              size="xs"
              disabled={!isNameValid() || newTableDescription === ""}
              onClick={() => fileInputRef.current?.click()}
            />
          )}
        </div>
        {table && (
          <div>
            <Button
              size={"xs"}
              label={"Delete"}
              onClick={async () => {
                const res = await fetch(
                  `/api/w/${workspaceId}/data_sources/${dataSource.name}/tables/${table.table_id}`,
                  {
                    method: "DELETE",
                  }
                );

                if (!res.ok) {
                  sendNotification({
                    type: "error",
                    title: "Error deleting table",
                    description: `An error occured: ${await res.text()}.`,
                  });
                  return;
                }

                await mutate(
                  `/api/w/${workspaceId}/data_sources/${dataSource.name}/tables`
                );

                close();
              }}
              variant="primaryWarning"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
