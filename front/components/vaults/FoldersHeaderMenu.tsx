import {
  Button,
  CloudArrowUpIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  DropdownMenu,
  PlusIcon,
  TableIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import type { RefObject } from "react";
import { useState } from "react";

import type { ContentActionsRef } from "@app/components/vaults/ContentActions";
import VaultFolderModal from "@app/components/vaults/VaultFolderModal";
import { useDataSources } from "@app/lib/swr/data_sources";

type FoldersHeaderMenuProps = {
  owner: WorkspaceType;
  vault: VaultType;
  canWriteInVault: boolean;
  folder: DataSourceViewType;
  contentActionsRef: RefObject<ContentActionsRef>;
};

export const FoldersHeaderMenu = ({
  owner,
  vault,
  canWriteInVault,
  folder,
  contentActionsRef,
}: FoldersHeaderMenuProps) => {
  return (
    <>
      {canWriteInVault ? (
        <AddDataDropDownButton
          contentActionsRef={contentActionsRef}
          canWriteInVault={canWriteInVault}
        />
      ) : (
        <Tooltip
          label={
            vault.kind === "global"
              ? `Only builders of the workspace can add data in the Company Data vault.`
              : `Only members of the vault can add data.`
          }
          side="top"
          trigger={
            <AddDataDropDownButton
              contentActionsRef={contentActionsRef}
              canWriteInVault={canWriteInVault}
            />
          }
        />
      )}
      {canWriteInVault ? (
        <EditFolderButton
          owner={owner}
          vault={vault}
          folder={folder}
          canWriteInVault={canWriteInVault}
        />
      ) : (
        <Tooltip
          label={
            vault.kind === "global"
              ? `Only builders of the workspace can edit a folder in the Company Data vault.`
              : `Only members of the vault can edit a folder.`
          }
          side="top"
          trigger={
            <EditFolderButton
              owner={owner}
              vault={vault}
              folder={folder}
              canWriteInVault={canWriteInVault}
            />
          }
        />
      )}
    </>
  );
};

type AddDataDropDrownButtonProps = {
  contentActionsRef: RefObject<ContentActionsRef>;
  canWriteInVault: boolean;
};

const AddDataDropDownButton = ({
  contentActionsRef,
  canWriteInVault,
}: AddDataDropDrownButtonProps) => {
  return (
    <DropdownMenu>
      <DropdownMenu.Button>
        <Button
          size="sm"
          label="Add data"
          icon={PlusIcon}
          variant="primary"
          type="menu"
          disabled={!canWriteInVault}
        />
      </DropdownMenu.Button>

      <DropdownMenu.Items width={300}>
        <DropdownMenu.Item
          icon={DocumentTextIcon}
          onClick={() => {
            contentActionsRef.current?.callAction("DocumentUploadOrEdit");
          }}
          label="Create a document"
        />
        <DropdownMenu.Item
          icon={TableIcon}
          onClick={() => {
            contentActionsRef.current?.callAction("TableUploadOrEdit");
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
  );
};

type EditFolderButtonProps = {
  owner: WorkspaceType;
  vault: VaultType;
  folder: DataSourceViewType;
  canWriteInVault: boolean;
};

const EditFolderButton = ({
  owner,
  vault,
  folder,
  canWriteInVault,
}: EditFolderButtonProps) => {
  const { dataSources } = useDataSources(owner);

  const [showEditFolderModal, setShowEditFolderModal] = useState(false);

  return (
    <>
      <VaultFolderModal
        isOpen={showEditFolderModal}
        onClose={() => {
          setShowEditFolderModal(false);
        }}
        owner={owner}
        vault={vault}
        dataSources={dataSources}
        dataSourceViewId={folder.sId}
      />
      <Button
        size="sm"
        label="Edit folder"
        icon={Cog6ToothIcon}
        variant="primary"
        onClick={() => {
          setShowEditFolderModal(true);
        }}
        disabled={!canWriteInVault}
      />
    </>
  );
};
