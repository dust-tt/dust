import { PencilSquareIcon, TrashIcon } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightContentNode,
  PlanType,
  WorkspaceType,
} from "@dust-tt/types";
import { isFolder, isWebsite } from "@dust-tt/types";
import type { RefObject } from "react";
import React, { useImperativeHandle, useState } from "react";

import { DocumentDeleteDialog } from "@app/components/data_source/DocumentDeleteDialog";
import { DocumentUploadOrEditModal } from "@app/components/data_source/DocumentUploadOrEditModal";
import { MultipleDocumentsUpload } from "@app/components/data_source/MultipleDocumentsUpload";
import { TableDeleteDialog } from "@app/components/data_source/TableDeleteDialog";
import { TableUploadOrEditModal } from "@app/components/data_source/TableUploadOrEditModal";

type ContentActionKey =
  | "DocumentUploadOrEditModal"
  | "MultipleDocumentsUpload"
  | "DocumentDeleteDialog"
  | "TableUploadOrEditModal"
  | "TableDeleteDialog";

export type ContentAction = {
  action?: ContentActionKey;
  contentNode?: LightContentNode;
};

type ContentActionsProps = {
  dataSourceView: DataSourceViewType;
  plan: PlanType;
  owner: WorkspaceType;
  onSave: () => void;
};

export type ContentActionsRef = {
  callAction: (
    action: ContentActionKey,
    contentNode?: LightContentNode
  ) => void;
};

export const ContentActions = React.forwardRef<
  ContentActionsRef,
  ContentActionsProps
>(({ dataSourceView, owner, plan, onSave }: ContentActionsProps, ref) => {
  const [currentAction, setCurrentAction] = useState<ContentAction>({});
  useImperativeHandle(ref, () => ({
    callAction: (action: ContentActionKey, contentNode?: LightContentNode) => {
      setCurrentAction({ action, contentNode });
    },
  }));

  const onClose = (save: boolean) => {
    // Keep current to have it during closing animation
    setCurrentAction({ contentNode: currentAction.contentNode });
    if (save) {
      onSave();
    }
  };

  return (
    <>
      <DocumentUploadOrEditModal
        contentNode={currentAction.contentNode}
        dataSourceView={dataSourceView}
        isOpen={currentAction.action === "DocumentUploadOrEditModal"}
        onClose={onClose}
        owner={owner}
        plan={plan}
      />
      <MultipleDocumentsUpload
        dataSourceView={dataSourceView}
        isOpen={currentAction.action === "MultipleDocumentsUpload"}
        onClose={onClose}
        owner={owner}
        plan={plan}
      />
      {currentAction.contentNode && (
        <DocumentDeleteDialog
          contentNode={currentAction.contentNode}
          dataSourceView={dataSourceView}
          isOpen={currentAction.action === "DocumentDeleteDialog"}
          onClose={onClose}
          owner={owner}
        />
      )}
      <TableUploadOrEditModal
        contentNode={currentAction.contentNode}
        dataSourceView={dataSourceView}
        isOpen={currentAction.action === "TableUploadOrEditModal"}
        onClose={onClose}
        owner={owner}
        plan={plan}
      />
      {currentAction.contentNode && (
        <TableDeleteDialog
          contentNode={currentAction.contentNode}
          dataSourceView={dataSourceView}
          isOpen={currentAction.action === "TableDeleteDialog"}
          onClose={onClose}
          owner={owner}
        />
      )}
    </>
  );
});

ContentActions.displayName = "ContentActions";

export const getMenuItems = (
  dataSourceView: DataSourceViewType,
  contentNode: LightContentNode,
  contentActionsRef: RefObject<ContentActionsRef>
) => {
  if (isFolder(dataSourceView.dataSource)) {
    return [
      {
        label: "Edit",
        icon: PencilSquareIcon,
        onClick: () => {
          contentActionsRef.current &&
            contentActionsRef.current?.callAction(
              contentNode.type === "file"
                ? ("DocumentUploadOrEditModal" as const)
                : ("TableUploadOrEditModal" as const),
              contentNode
            );
        },
      },
      {
        label: "Delete",
        icon: TrashIcon,
        onClick: () => {
          contentActionsRef.current &&
            contentActionsRef.current?.callAction(
              contentNode.type === "file"
                ? ("DocumentDeleteDialog" as const)
                : ("TableDeleteDialog" as const),
              contentNode
            );
        },
        variant: "warning",
      },
    ];
  }
  if (isWebsite(dataSourceView.dataSource)) {
    // TODO(GROUPS_UI): Actions for webrawler datasource
    return null;
  }
  // TODO(GROUPS_UI): Actions for managed datasource
  return null;
};
