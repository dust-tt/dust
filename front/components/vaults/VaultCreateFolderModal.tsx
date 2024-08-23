import {
  ExclamationCircleStrokeIcon,
  Input,
  Modal,
  Page,
  TextArea,
} from "@dust-tt/sparkle";
import type {
  APIError,
  DataSourceType,
  DataSourceViewType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { isDataSourceNameValid } from "@dust-tt/types";
import { useRouter } from "next/router";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";

export default function VaultCreateFolderModal({
  isOpen,
  setOpen,
  owner,
  vault,
  dataSources,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  owner: WorkspaceType;
  vault: VaultType;
  dataSources: DataSourceType[];
}) {
  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);

  const [name, setName] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const [description, setDescription] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setOpen(false);
      }}
      onSave={async () => {
        if (!name) {
          setNameError("Name is required.");
          return;
        }
        const nameValidRes = isDataSourceNameValid(name);
        if (nameValidRes.isErr()) {
          setNameError(
            "Name is invalid, must be multiple characters with no space."
          );
          return;
        }
        if (dataSources.find((ds) => ds.name === name)) {
          setNameError("A data source with this name already exists.");
          return;
        }

        if (!description || description.trim() === "") {
          setDescriptionError("Description is required.");
          return;
        }

        const res = await fetch(
          `/api/w/${owner.sId}/vaults/${vault.sId}/data_sources`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name,
              description,
              assistantDefaultSelected: false,
            }),
          }
        );
        if (res.ok) {
          setOpen(false);
          const { dataSourceView } = (await res.json()) as {
            dataSourceView: DataSourceViewType;
          };
          await router.push(
            `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/folder/data_source_views/${dataSourceView.sId}`
          );
          sendNotification({
            type: "success",
            title: "Successfully created folder",
            description: "Folder was successfully created.",
          });
        } else {
          const err = (await res.json()) as { error: APIError };
          sendNotification({
            title: "Error Saving Folder",
            type: "error",
            description: `Error: ${err.error.message}`,
          });
          return;
        }
      }}
      hasChanged={name !== null || description !== null}
      variant="side-sm"
      title="Create a folder"
    >
      <Page variant="modal">
        <div className="w-full">
          <Page.Vertical sizing="grow">
            <Page.H>Name</Page.H>
            <div className="w-full">
              <Input
                placeholder="folder_name"
                name="name"
                value={name}
                onChange={(value) => {
                  setName(value);
                  setNameError(null);
                }}
                error={nameError}
                showErrorLabel
              />
              <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                <ExclamationCircleStrokeIcon /> Folder name must be unique and
                not use spaces.
              </p>
            </div>

            <Page.Separator />
            <Page.H>Description</Page.H>
            <div className="w-full">
              <TextArea
                placeholder="Folder description"
                value={description}
                onChange={(value) => {
                  setDescription(value);
                  setDescriptionError(null);
                }}
                error={descriptionError}
                showErrorLabel
              />
            </div>
          </Page.Vertical>
        </div>
      </Page>
    </Modal>
  );
}
