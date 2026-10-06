import type { ContentActionsRef } from "@app/components/spaces/ContentActions";
import SpaceFolderModal from "@app/components/spaces/SpaceFolderModal";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { GLOBAL_SPACE_NAME } from "@app/types/groups";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  File04,
  Plus,
  Settings01,
  Table,
  Tooltip,
  UploadCloud02,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { RefObject } from "react";
import { useState } from "react";

interface FoldersHeaderMenuProps {
  canWriteInSpace: boolean;
  contentActionsRef: RefObject<ContentActionsRef>;
  folder: DataSourceViewType;
  owner: LightWorkspaceType;
  space: SpaceType;
}

export const FoldersHeaderMenu = ({
  canWriteInSpace,
  contentActionsRef,
  folder,
  owner,
  space,
}: FoldersHeaderMenuProps) => {
  const { t } = useLingui();

  return (
    <>
      {canWriteInSpace ? (
        <AddDataDropDownButton
          contentActionsRef={contentActionsRef}
          canWriteInSpace={canWriteInSpace}
        />
      ) : (
        <Tooltip
          label={
            space.kind === "global"
              ? t`You need write access to add data in the ${GLOBAL_SPACE_NAME} space.`
              : t`Only members of the space can add data.`
          }
          side="top"
          trigger={
            <AddDataDropDownButton
              contentActionsRef={contentActionsRef}
              canWriteInSpace={canWriteInSpace}
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
              ? t`You need write access to edit a folder in the ${GLOBAL_SPACE_NAME} space.`
              : t`Only members of the space can edit a folder.`
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
};

const AddDataDropDownButton = ({
  contentActionsRef,
  canWriteInSpace,
}: AddDataDropDrownButtonProps) => {
  const { t } = useLingui();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          label={t`Add data`}
          icon={Plus}
          variant="primary"
          isSelect
          disabled={!canWriteInSpace}
        />
      </DropdownMenuTrigger>
      {canWriteInSpace && (
        <DropdownMenuContent>
          <DropdownMenuItem
            icon={File04}
            onClick={() => {
              contentActionsRef.current?.callAction("DocumentUploadOrEdit");
            }}
            label={t`Create a document`}
          />
          <DropdownMenuItem
            icon={Table}
            onClick={() => {
              contentActionsRef.current?.callAction("TableUploadOrEdit");
            }}
            label={t`Create a table`}
          />
          <DropdownMenuItem
            icon={UploadCloud02}
            onClick={() => {
              contentActionsRef.current?.callAction("MultipleFilesUpload");
            }}
            label={t`Upload files`}
          />
        </DropdownMenuContent>
      )}
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
  const { t } = useLingui();
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
        label={t`Edit folder`}
        icon={Settings01}
        variant="primary"
        onClick={() => {
          setShowEditFolderModal(true);
        }}
        disabled={!canWriteInSpace}
      />
    </>
  );
};
