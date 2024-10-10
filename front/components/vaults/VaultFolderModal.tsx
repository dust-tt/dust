import {
  Button,
  ExclamationCircleStrokeIcon,
  Input,
  Modal,
  Page,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import type { DataSourceType, VaultType, WorkspaceType } from "@dust-tt/types";
import { isDataSourceNameValid } from "@dust-tt/types";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { DeleteStaticDataSourceDialog } from "@app/components/data_source/DeleteStaticDataSourceDialog";
import {
  useCreateFolder,
  useDeleteFolderOrWebsite,
  useUpdateFolder,
  useVaultDataSourceView,
} from "@app/lib/swr/vaults";

export default function VaultFolderModal({
  isOpen,
  onClose,
  owner,
  vault,
  dataSources,
  dataSourceViewId,
}: {
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
  vault: VaultType;
  dataSources: DataSourceType[];
  dataSourceViewId: string | null;
}) {
  const { dataSourceView, isDataSourceViewLoading, mutate } =
    useVaultDataSourceView({
      owner,
      vaultId: vault.sId,
      dataSourceViewId: dataSourceViewId || undefined,
      disabled: !dataSourceViewId,
    });

  const doCreate = useCreateFolder({
    owner,
    vaultId: vault.sId,
  });
  const doUpdate = useUpdateFolder({
    owner,
    vaultId: vault.sId,
  });
  const doDelete = useDeleteFolderOrWebsite({
    owner,
    vaultId: vault.sId,
    category: "folder",
  });
  const router = useRouter();

  const defaultName = dataSourceView?.dataSource?.name ?? null;
  const defaultDescription = dataSourceView?.dataSource?.description ?? null;

  const [name, setName] = useState<string | null>(defaultName);
  const [description, setDescription] = useState<string | null>(
    defaultDescription
  );

  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);

  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (isOpen) {
      setName(dataSourceView ? dataSourceView.dataSource.name : null);
      setDescription(
        dataSourceView ? dataSourceView.dataSource.description : null
      );
    }
  }, [isOpen, dataSourceView]);

  const onSave = async () => {
    let nameError: string | null = null;

    if (!name) {
      nameError = "Name is required.";
    } else if (isDataSourceNameValid(name).isErr()) {
      nameError = "Name is invalid, must be multiple characters with no space.";
    } else if (
      (!dataSourceView || dataSourceView.dataSource.name !== name) &&
      dataSources.find((ds) => ds.name === name)
    ) {
      nameError = "A data source with this name already exists.";
    }

    if (nameError) {
      setError(nameError);
      return;
    }

    if (!dataSourceView) {
      const dataSourceView = await doCreate(name, description);
      if (dataSourceView) {
        onClose();
        await router.push(
          `/w/${owner.sId}/vaults/${vault.sId}/categories/folder/data_source_views/${dataSourceView.sId}`
        );
      }
    } else {
      const res = await doUpdate(dataSourceView, description);
      if (res) {
        void mutate();
        onClose();
      }
    }
  };

  const onDeleteFolder = async () => {
    const res = await doDelete(dataSourceView);
    if (res) {
      onClose();
      await router.push(
        `/w/${owner.sId}/vaults/${vault.sId}/categories/folder`
      );
    }
  };

  const hasChanged = !dataSourceView
    ? name !== null || description !== null
    : description !== dataSourceView.dataSource.description;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onSave={onSave}
      hasChanged={hasChanged}
      variant="side-sm"
      title={!dataSourceView ? "Create Folder" : "Edit Folder"}
    >
      <Page variant="modal">
        <div className="w-full">
          {isDataSourceViewLoading ? (
            <Spinner />
          ) : (
            <Page.Vertical sizing="grow">
              <Page.SectionHeader title="Name" />
              <div className="w-full">
                <Input
                  placeholder="folder_name"
                  name="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                  }}
                  error={error}
                  disabled={!!dataSourceView} // We cannot change the name of a datasource
                  showErrorLabel
                />
                <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                  <ExclamationCircleStrokeIcon />{" "}
                  {!dataSourceView
                    ? "Folder name must be unique and not use spaces."
                    : "Folder name cannot be changed."}
                </p>
              </div>

              <Page.Separator />
              <Page.SectionHeader title="Description" />
              <div className="w-full">
                <TextArea
                  placeholder="Folder description"
                  value={description ?? ""}
                  onChange={(e) => {
                    setDescription(e.target.value);
                  }}
                  showErrorLabel
                  minRows={2}
                />
              </div>

              {dataSourceView && (
                <>
                  <Page.Separator />
                  <DeleteStaticDataSourceDialog
                    owner={owner}
                    dataSource={dataSourceView.dataSource}
                    handleDelete={onDeleteFolder}
                    isOpen={showDeleteConfirmDialog}
                    onClose={() => setShowDeleteConfirmDialog(false)}
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
          )}
        </div>
      </Page>
    </Modal>
  );
}
