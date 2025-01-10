import {
  Button,
  Input,
  Modal,
  Page,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import type { LightWorkspaceType, SpaceType } from "@dust-tt/types";
import { isDataSourceNameValid } from "@dust-tt/types";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { DeleteStaticDataSourceDialog } from "@app/components/data_source/DeleteStaticDataSourceDialog";
import {
  useCreateFolder,
  useDeleteFolderOrWebsite,
  useSpaceDataSourceView,
  useUpdateFolder,
} from "@app/lib/swr/spaces";

interface SpaceFolderModalProps {
  dataSourceViewId: string | null;
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
  space: SpaceType;
}

export default function SpaceFolderModal({
  dataSourceViewId,
  isOpen,
  onClose,
  owner,
  space,
}: SpaceFolderModalProps) {
  const { dataSourceView, isDataSourceViewLoading, mutate } =
    useSpaceDataSourceView({
      owner,
      spaceId: space.sId,
      dataSourceViewId: dataSourceViewId || undefined,
      disabled: !dataSourceViewId,
    });

  const doCreate = useCreateFolder({
    owner,
    spaceId: space.sId,
  });
  const doUpdate = useUpdateFolder({
    owner,
    spaceId: space.sId,
  });
  const doDelete = useDeleteFolderOrWebsite({
    owner,
    spaceId: space.sId,
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
          `/w/${owner.sId}/spaces/${space.sId}/categories/folder/data_source_views/${dataSourceView.sId}`
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
        `/w/${owner.sId}/spaces/${space.sId}/categories/folder`
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
                  message={error ?? "Folder name must be unique"}
                  messageStatus={error ? "error" : "info"}
                  disabled={!!dataSourceView} // We cannot change the name of a datasource
                />
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
                    variant="warning"
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
