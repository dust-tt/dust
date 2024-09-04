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
import type { DataSourceType, VaultType, WorkspaceType } from "@dust-tt/types";
import type { RefObject } from "react";
import { useState } from "react";

import type { ContentActionsRef } from "@app/components/vaults/ContentActions";
import VaultFolderModal from "@app/components/vaults/VaultFolderModal";
import { useDataSources } from "@app/lib/swr/data_sources";

type FoldersHeaderMenuProps = {
  owner: WorkspaceType;
  vault: VaultType;
  canWrite: boolean;
  folder: DataSourceType;
  contentActionsRef: RefObject<ContentActionsRef>;
};

export const FoldersHeaderMenu = ({
  owner,
  vault,
  canWrite,
  folder,
  contentActionsRef,
}: FoldersHeaderMenuProps) => {
  return (
    <>
      {canWrite ? (
        <AddDataDropDownButton
          contentActionsRef={contentActionsRef}
          canWrite={canWrite}
        />
      ) : (
        <Tooltip
          label={
            vault.kind === "global"
              ? `Only builders of the workspace can add data in the Company Data vault.`
              : `Only members of the vault can add data.`
          }
          position="above"
        >
          <AddDataDropDownButton
            contentActionsRef={contentActionsRef}
            canWrite={canWrite}
          />
        </Tooltip>
      )}
      {canWrite ? (
        <EditFolderButton
          owner={owner}
          vault={vault}
          folder={folder}
          canWrite={canWrite}
        />
      ) : (
        <Tooltip
          label={
            vault.kind === "global"
              ? `Only builders of the workspace can edit a folder in the Company Data vault.`
              : `Only members of the vault can edit a folder.`
          }
          position="above"
        >
          <EditFolderButton
            owner={owner}
            vault={vault}
            folder={folder}
            canWrite={canWrite}
          />
        </Tooltip>
      )}
    </>
  );
};

const AddDataDropDownButton = ({
  contentActionsRef,
  canWrite,
}: {
  contentActionsRef: RefObject<ContentActionsRef>;
  canWrite: boolean;
}) => {
  return (
    <DropdownMenu>
      <DropdownMenu.Button>
        <Button
          size="sm"
          label="Add data"
          icon={PlusIcon}
          variant="primary"
          type="menu"
          disabled={!canWrite}
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

const EditFolderButton = ({
  owner,
  vault,
  folder,
  canWrite,
}: {
  owner: WorkspaceType;
  vault: VaultType;
  folder: DataSourceType;
  canWrite: boolean;
}) => {
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
        folder={folder}
      />
      <Button
        size="sm"
        label="Edit folder"
        icon={Cog6ToothIcon}
        variant="primary"
        onClick={() => {
          setShowEditFolderModal(true);
        }}
        disabled={!canWrite}
      />
    </>
  );
};
