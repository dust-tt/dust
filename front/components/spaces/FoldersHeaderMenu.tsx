import {
  Button,
  CloudArrowUpIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PlusIcon,
  Sheet,
  SheetTrigger,
  TableIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightWorkspaceType,
  PlanType,
  SpaceType,
} from "@dust-tt/types";
import type { RefObject } from "react";
import { useState } from "react";

import { DocumentUploadOrEditModal } from "@app/components/data_source/DocumentUploadOrEditModal";
import { TableUploadOrEditModal } from "@app/components/data_source/TableUploadOrEditModal";
import type {
  ContentActionKey,
  ContentActionsRef,
} from "@app/components/spaces/ContentActions";
import SpaceFolderModal from "@app/components/spaces/SpaceFolderModal";

interface FoldersHeaderMenuProps {
  canWriteInSpace: boolean;
  contentActionsRef: RefObject<ContentActionsRef>;
  folder: DataSourceViewType;
  owner: LightWorkspaceType;
  space: SpaceType;
  plan: PlanType;
  totalNodesCount: number;
  onSave: (action: ContentActionKey) => void;
}

export const FoldersHeaderMenu = ({
  canWriteInSpace,
  contentActionsRef,
  folder,
  owner,
  space,
  plan,
  totalNodesCount,
  onSave,
}: FoldersHeaderMenuProps) => {
  return (
    <>
      {canWriteInSpace ? (
        <AddDataDropDownButton
          contentActionsRef={contentActionsRef}
          canWriteInSpace={canWriteInSpace}
          owner={owner}
          plan={plan}
          dataSourceView={folder}
          totalNodesCount={totalNodesCount}
          onSave={onSave}
        />
      ) : (
        <Tooltip
          label={
            space.kind === "global"
              ? `Only builders of the workspace can add data in the Company Data space.`
              : `Only members of the space can add data.`
          }
          side="top"
          trigger={
            <AddDataDropDownButton
              contentActionsRef={contentActionsRef}
              canWriteInSpace={canWriteInSpace}
              owner={owner}
              plan={plan}
              dataSourceView={folder}
              totalNodesCount={totalNodesCount}
              onSave={onSave}
            />
          }
        />
      )}
      {canWriteInSpace ? (
        <EditFolderButton
          owner={owner}
          space={space}
          folder={folder}
          canWriteInSpace={canWriteInSpace}
        />
      ) : (
        <Tooltip
          label={
            space.kind === "global"
              ? `Only builders of the workspace can edit a folder in the Company Data space.`
              : `Only members of the space can edit a folder.`
          }
          side="top"
          trigger={
            <EditFolderButton
              owner={owner}
              space={space}
              folder={folder}
              canWriteInSpace={canWriteInSpace}
            />
          }
        />
      )}
    </>
  );
};

type AddDataDropDrownButtonProps = {
  contentActionsRef: RefObject<ContentActionsRef>;
  canWriteInSpace: boolean;
  owner: LightWorkspaceType;
  plan: PlanType;
  dataSourceView: DataSourceViewType;
  totalNodesCount: number;
  onSave: (action: ContentActionKey) => void;
};

const AddDataDropDownButton = ({
  contentActionsRef,
  canWriteInSpace,
  owner,
  plan,
  dataSourceView,
  totalNodesCount,
  onSave,
}: AddDataDropDrownButtonProps) => {
  const [documentSheetOpen, setDocumentSheetOpen] = useState(false);
  const [tableSheetOpen, setTableSheetOpen] = useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          label="Add data"
          icon={PlusIcon}
          variant="primary"
          isSelect
          disabled={!canWriteInSpace}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <Sheet open={documentSheetOpen} onOpenChange={setDocumentSheetOpen}>
          <SheetTrigger asChild>
            <DropdownMenuItem
              icon={DocumentTextIcon}
              label="Create a document"
              onSelect={(e) => {
                e.preventDefault();
              }}
            />
          </SheetTrigger>
          <DocumentUploadOrEditModal
            dataSourceView={dataSourceView}
            owner={owner}
            plan={plan}
            totalNodesCount={totalNodesCount}
            onClose={(save) => {
              if (save) {
                onSave("DocumentUploadOrEdit");
                setDocumentSheetOpen(false);
              }
            }}
          />
        </Sheet>

        <Sheet open={tableSheetOpen} onOpenChange={setTableSheetOpen}>
          <SheetTrigger asChild>
            <DropdownMenuItem
              icon={TableIcon}
              label="Create a table"
              onSelect={(e) => {
                e.preventDefault();
              }}
            />
          </SheetTrigger>
          <TableUploadOrEditModal
            dataSourceView={dataSourceView}
            owner={owner}
            plan={plan}
            totalNodesCount={totalNodesCount}
            onClose={(save) => {
              if (save) {
                onSave("TableUploadOrEdit");
                setTableSheetOpen(false);
              }
            }}
          />
        </Sheet>

        <DropdownMenuItem
          icon={CloudArrowUpIcon}
          onClick={() => {
            contentActionsRef.current?.callAction("MultipleDocumentsUpload");
          }}
          label="Upload multiple documents"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface EditFolderButtonProps {
  canWriteInSpace: boolean;
  folder: DataSourceViewType;
  owner: LightWorkspaceType;
  space: SpaceType;
}

const EditFolderButton = ({
  canWriteInSpace,
  folder,
  owner,
  space,
}: EditFolderButtonProps) => {
  const [showEditFolderModal, setShowEditFolderModal] = useState(false);

  return (
    <>
      <SpaceFolderModal
        isOpen={showEditFolderModal}
        onClose={() => {
          setShowEditFolderModal(false);
        }}
        owner={owner}
        space={space}
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
        disabled={!canWriteInSpace}
      />
    </>
  );
};
