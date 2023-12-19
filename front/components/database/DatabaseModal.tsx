import { Button, Input, Modal } from "@dust-tt/sparkle";
import { CoreAPIDatabase, DataSourceType } from "@dust-tt/types";
import React, { useContext, useRef } from "react";
import { useSWRConfig } from "swr";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";
import { useDatabaseTables } from "@app/lib/swr";

export function DatabaseModal({
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
          if (file.size > 5000000) {
            // TODO handle ?
            sendNotification({
              type: "error",
              title: "File too large",
              description: "Please upload a file smaller than 5MB.",
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
          if (res.value.content.length > 1000000) {
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
        {database && (
          <div>
            <Button
              size={"xs"}
              label={"Delete"}
              onClick={async () => {
                const res = await fetch(
                  `/api/w/${workspaceId}/data_sources/${dataSource.name}/databases/${database.database_id}`,
                  {
                    method: "DELETE",
                  }
                );

                if (!res.ok) {
                  sendNotification({
                    type: "error",
                    title: "Error deleting database",
                    description: `An error occured: ${await res.text()}.`,
                  });
                  return;
                }

                await mutate(
                  `/api/w/${workspaceId}/data_sources/${dataSource.name}/databases?offset=0&limit=100`
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
