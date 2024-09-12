import {
  Button,
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
import { useContext, useEffect, useState } from "react";

import { DeleteStaticDataSourceDialog } from "@app/components/data_source/DeleteStaticDataSourceDialog";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useVaultDataSourceViews } from "@app/lib/swr/vaults";
import type { PostVaultDataSourceResponseBody } from "@app/pages/api/w/[wId]/vaults/[vId]/data_sources";

export default function VaultFolderModal({
  isOpen,
  onClose,
  owner,
  vault,
  dataSources,
  folder,
}: {
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
  vault: VaultType;
  dataSources: DataSourceType[];
  folder: DataSourceType | null;
}) {
  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);
  const { mutateVaultDataSourceViews: mutate } = useVaultDataSourceViews({
    workspaceId: owner.sId,
    vaultId: vault.sId,
    category: "folder",
    disabled: true, // We don't need to fetch the data source views here, we want the mutate function to refresh the data elsewhere.
  });

  const defaultName = folder?.name ?? null;
  const defaultDescription = folder?.description ?? null;

  const [name, setName] = useState<string | null>(defaultName);
  const [description, setDescription] = useState<string | null>(
    defaultDescription
  );

  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);

  const [errors, setErrors] = useState<{
    name: string | null;
    description: string | null;
  }>({
    name: null,
    description: null,
  });

  useEffect(() => {
    setName(folder ? folder.name : null);
    setDescription(folder ? folder.description : null);
  }, [folder]);

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
      await mutate();
      handleOnClose();
      const response: PostVaultDataSourceResponseBody = await res.json();
      const { dataSourceView } = response;
      await router.push(
        `/w/${owner.sId}/vaults/${vault.sId}/categories/folder/data_source_views/${dataSourceView.sId}`
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

  // TODO(DATASOURCE_SID) - move to sId
  const patchUpdateFolder = async (folderName: string) => {
    const res = await fetch(
      `/api/w/${owner.sId}/vaults/${vault.sId}/data_sources/${folderName}`,
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
      handleOnClose();
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
      // TODO(DATASOURCE_SID) - move to sId
      await patchUpdateFolder(folder.name);
    }
  };

  const onDeleteFolder = async () => {
    if (folder === null) {
      return;
    }
    const res = await fetch(
      // TODO(DATASOURCE_SID) - move to sId
      `/api/w/${owner.sId}/vaults/${vault.sId}/data_sources/${folder.name}`,
      {
        method: "DELETE",
      }
    );
    if (res.ok) {
      await mutate();
      handleOnClose();
      await router.push(
        `/w/${owner.sId}/vaults/${vault.sId}/categories/folder`
      );
      sendNotification({
        type: "success",
        title: "Successfully deleted folder",
        description: "Folder was successfully deleted.",
      });
    } else {
      const err: { error: APIError } = await res.json();
      sendNotification({
        type: "error",
        title: "Error deleting Folder",
        description: `Error: ${err.error.message}`,
      });
    }
  };

  const handleOnClose = () => {
    onClose();
    setName(defaultName);
    setDescription(defaultDescription);
  };

  const hasChanged =
    folder === null
      ? name !== null || description !== null
      : description !== folder.description;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
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
                  : "Folder name cannot be changed."}
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
                minRows={2}
              />
            </div>

            {folder !== null && (
              <>
                <Page.Separator />
                <DeleteStaticDataSourceDialog
                  handleDelete={onDeleteFolder}
                  isOpen={showDeleteConfirmDialog}
                  onClose={onClose}
                />
                <Button
                  size="sm"
                  label="Delete Folder"
                  variant="primaryWarning"
                  onClick={() => setShowDeleteConfirmDialog(true)}
                />
              </>
            )}
          </Page.Vertical>
        </div>
      </Page>
    </Modal>
  );
}
