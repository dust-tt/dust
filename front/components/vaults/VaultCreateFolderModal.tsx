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
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { isDataSourceNameValid } from "@dust-tt/types";
import { useRouter } from "next/router";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import type { PostVaultDataSourceResponseBody } from "@app/pages/api/w/[wId]/vaults/[vId]/data_sources";

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
  const [description, setDescription] = useState<string | null>(null);

  const [errors, setErrors] = useState<{
    name: string | null;
    description: string | null;
  }>({
    name: null,
    description: null,
  });

  const onSave = async () => {
    let nameError: string | null = null;
    let descriptionError: string | null = null;

    if (!name) {
      nameError = "Name is required.";
    } else if (isDataSourceNameValid(name).isErr()) {
      nameError = "Name is invalid, must be multiple characters with no space.";
    } else if (dataSources.find((ds) => ds.name === name)) {
      nameError = "A data source with this name already exists.";
    }

    if (!description || description.trim() === "") {
      descriptionError = "Description is required.";
    }

    if (nameError || descriptionError) {
      setErrors({
        name: nameError,
        description: descriptionError,
      });
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
        }),
      }
    );
    if (res.ok) {
      setOpen(false);
      const response: PostVaultDataSourceResponseBody = await res.json();
      const { dataSourceView } = response;
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
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setOpen(false);
      }}
      onSave={onSave}
      hasChanged={name !== null || description !== null}
      variant="side-sm"
      title="Create a folder"
    >
      <Page variant="modal">
        <div className="w-full">
          <Page.Vertical sizing="grow">
            <Page.SectionHeader title="Name" />
            <div className="w-full">
              <Input
                placeholder="folder_name"
                name="name"
                value={name}
                onChange={(value) => {
                  setName(value);
                  if (errors.name) {
                    setErrors({ ...errors, name: null });
                  }
                }}
                error={errors.name}
                showErrorLabel
              />
              <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                <ExclamationCircleStrokeIcon /> Folder name must be unique and
                not use spaces.
              </p>
            </div>

            <Page.Separator />
            <Page.SectionHeader title="Description" />
            <div className="w-full">
              <TextArea
                placeholder="Folder description"
                value={description}
                onChange={(value) => {
                  setDescription(value);
                  if (errors.description) {
                    setErrors({ ...errors, description: null });
                  }
                }}
                error={errors.description}
                showErrorLabel
              />
            </div>
          </Page.Vertical>
        </div>
      </Page>
    </Modal>
  );
}
