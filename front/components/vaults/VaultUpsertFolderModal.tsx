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

export default function VaultUpsertFolderModal({
  isOpen,
  setOpen,
  owner,
  vault,
  dataSources,
  folder,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  owner: WorkspaceType;
  vault: VaultType;
  dataSources: DataSourceType[];
  folder: DataSourceType | null;
}) {
  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);

  const [name, setName] = useState<string | null>(folder?.name ?? null);
  const [description, setDescription] = useState<string | null>(
    folder?.description ?? null
  );

  const [errors, setErrors] = useState<{
    name: string | null;
    description: string | null;
  }>({
    name: null,
    description: null,
  });

  const postCreateFolder = async () => {
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
      const err: { error: APIError } = await res.json();
      sendNotification({
        type: "error",
        title: "Error creating Folder",
        description: `Error: ${err.error.message}`,
      });
    }
  };

  const patchUpdateFolder = async (folderId: string) => {
    const res = await fetch(
      `/api/w/${owner.sId}/vaults/${vault.sId}/data_sources/${folderId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description,
        }),
      }
    );
    if (res.ok) {
      setOpen(false);
      sendNotification({
        type: "success",
        title: "Successfully updated folder",
        description: "Folder was successfully updated.",
      });
    } else {
      const err: { error: APIError } = await res.json();
      sendNotification({
        type: "error",
        title: "Error updating Folder",
        description: `Error: ${err.error.message}`,
      });
    }
  };

  const onSave = async () => {
    let nameError: string | null = null;
    let descriptionError: string | null = null;

    if (!name) {
      nameError = "Name is required.";
    } else if (isDataSourceNameValid(name).isErr()) {
      nameError = "Name is invalid, must be multiple characters with no space.";
    } else if (
      (folder === null || folder.name !== name) &&
      dataSources.find((ds) => ds.name === name)
    ) {
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

    if (folder === null) {
      await postCreateFolder();
    } else {
      await patchUpdateFolder(folder.sId);
    }
  };

  const hasChanged =
    folder === null
      ? name !== null || description !== null
      : description !== folder.description;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setOpen(false);
      }}
      onSave={onSave}
      hasChanged={hasChanged}
      variant="side-sm"
      title={folder === null ? "Create Folder" : "Edit Folder"}
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
                disabled={folder !== null} // We cannot change the name of a datasource
                showErrorLabel
              />
              <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                <ExclamationCircleStrokeIcon />{" "}
                {folder === null
                  ? "Folder name must be unique and not use spaces."
                  : "Folder name change not allowed."}
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
