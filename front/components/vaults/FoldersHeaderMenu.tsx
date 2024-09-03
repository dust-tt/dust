import {
  Button,
  CloudArrowUpIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  DropdownMenu,
  PlusIcon,
  TableIcon,
} from "@dust-tt/sparkle";
import type { DataSourceType, VaultType, WorkspaceType } from "@dust-tt/types";
import type { RefObject } from "react";
import { useState } from "react";

import type { ContentActionsRef } from "@app/components/vaults/ContentActions";
import VaultFolderModal from "@app/components/vaults/VaultFolderModal";
import { useDataSources } from "@app/lib/swr";

type FoldersHeaderMenuProps = {
  owner: WorkspaceType;
  vault: VaultType;
  folder: DataSourceType;
  contentActionsRef: RefObject<ContentActionsRef>;
};

export const FoldersHeaderMenu = ({
  owner,
  vault,
  folder,
  contentActionsRef,
}: FoldersHeaderMenuProps) => {
  const [showEditFolderModal, setShowEditFolderModal] = useState(false);

  const { dataSources } = useDataSources(owner);

  return (
    <>
      <VaultFolderModal
        isOpen={showEditFolderModal}
        setOpen={(isOpen) => {
          setShowEditFolderModal(isOpen);
        }}
        owner={owner}
        vault={vault}
        dataSources={dataSources}
        folder={folder}
      />
      <DropdownMenu>
        <DropdownMenu.Button>
          <Button
            size="sm"
            label="Add data"
            icon={PlusIcon}
            variant="primary"
            type="menu"
          />
        </DropdownMenu.Button>

        <DropdownMenu.Items width={300}>
          <DropdownMenu.Item
            icon={DocumentTextIcon}
            onClick={() => {
              contentActionsRef.current?.callAction(
                "DocumentUploadOrEditModal"
              );
            }}
            label="Create a document"
          />
          <DropdownMenu.Item
            icon={TableIcon}
            onClick={() => {
              contentActionsRef.current?.callAction("TableUploadOrEditModal");
            }}
            label="Create a table"
          />
          <DropdownMenu.Item
            icon={CloudArrowUpIcon}
            onClick={() => {
              contentActionsRef.current?.callAction("MultipleDocumentsUpload");
            }}
            label="Upload multiple files"
          />
        </DropdownMenu.Items>
      </DropdownMenu>
      <Button
        size="sm"
        label="Edit folder"
        icon={Cog6ToothIcon}
        variant="primary"
        onClick={() => {
          setShowEditFolderModal(true);
        }}
      />
    </>
  );
};
