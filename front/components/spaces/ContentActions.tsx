import type { MenuItem } from "@dust-tt/sparkle";
import { ExternalLinkIcon, EyeIcon, PencilSquareIcon, PlusIcon, TrashIcon, useHashParam } from "@dust-tt/sparkle";
import type { DataSourceViewContentNode, DataSourceViewType, PlanType, WorkspaceType } from "@dust-tt/types";
import { capitalize } from "lodash";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import React, { useCallback, useEffect, useImperativeHandle, useState } from "react";

import { DocumentOrTableDeleteDialog } from "@app/components/data_source/DocumentOrTableDeleteDialog";
import { DocumentUploadOrEditModal } from "@app/components/data_source/DocumentUploadOrEditModal";
import { MultipleDocumentsUpload } from "@app/components/data_source/MultipleDocumentsUpload";
import { TableUploadOrEditModal } from "@app/components/data_source/TableUploadOrEditModal";
import DataSourceViewDocumentModal from "@app/components/DataSourceViewDocumentModal";
import { AddToSpaceDialog } from "@app/components/spaces/AddToSpaceDialog";
import { getDisplayNameForDataSource, isFolder, isManaged, isWebsite } from "@app/lib/data_sources";

export type UploadOrEditContentActionKey =
  | "DocumentUploadOrEdit"
  | "TableUploadOrEdit";

export type ContentActionKey =
  | UploadOrEditContentActionKey
  | "MultipleDocumentsUpload"
  | "DocumentOrTableDeleteDialog"
  | "DocumentViewRawContent"
  | "AddToSpaceDialog";

export type ContentAction = {
  action?: ContentActionKey;
  contentNode?: DataSourceViewContentNode;
};

const isUploadOrEditAction = (
  action: ContentActionKey | undefined
): action is UploadOrEditContentActionKey =>
  ["DocumentUploadOrEdit", "TableUploadOrEdit"].includes(action || "");

type ContentActionsProps = {
  dataSourceView: DataSourceViewType;
  totalNodesCount: number;
  plan: PlanType;
  owner: WorkspaceType;
  onSave: (action?: ContentActionKey) => void;
};

export type ContentActionsRef = {
  callAction: (
    action: ContentActionKey,
    contentNode?: DataSourceViewContentNode
  ) => void;
};

export const ContentActions = React.forwardRef<
  ContentActionsRef,
  ContentActionsProps
>(
  (
    {
      dataSourceView,
      totalNodesCount,
      owner,
      plan,
      onSave,
    }: ContentActionsProps,
    ref
  ) => {
    const [currentAction, setCurrentAction] = useState<ContentAction>({});
    useImperativeHandle(ref, () => ({
      callAction: (
        action: ContentActionKey,
        contentNode?: DataSourceViewContentNode
      ) => {
        setCurrentAction({ action, contentNode });
      },
    }));

    const [currentDocumentId, setCurrentDocumentId] =
      useHashParam("documentId");

    useEffect(() => {
      if (currentAction.action === "DocumentViewRawContent") {
        setCurrentDocumentId(currentAction.contentNode?.internalId ?? "");
      }
    }, [currentAction, setCurrentDocumentId]);

    const onClose = useCallback(
      (save: boolean) => {
        const action = currentAction.action;

        // Clear the action
        setCurrentAction({ contentNode: currentAction.contentNode });

        if (save) {
          onSave(action);
        }
      },
      [currentAction, onSave]
    );

    const contentNode = isUploadOrEditAction(currentAction.action)
      ? currentAction.contentNode
      : undefined;

    // This is a union of the props for the two modals
    // Makes sense because both expect the same schema
    const modalProps = {
      contentNode,
      dataSourceView,
      isOpen: isUploadOrEditAction(currentAction.action),
      onClose,
      owner,
      plan,
      totalNodesCount,
      initialId: contentNode?.internalId,
    };

    return (
      <>
        {currentAction.action === "TableUploadOrEdit" ? (
          <TableUploadOrEditModal {...modalProps} />
        ) : (
          <DocumentUploadOrEditModal {...modalProps} />
        )}
        <MultipleDocumentsUpload
          dataSourceView={dataSourceView}
          isOpen={currentAction.action === "MultipleDocumentsUpload"}
          onClose={onClose}
          owner={owner}
          totalNodesCount={totalNodesCount}
          plan={plan}
        />
        {currentAction.contentNode && (
          <DocumentOrTableDeleteDialog
            dataSourceView={dataSourceView}
            isOpen={currentAction.action === "DocumentOrTableDeleteDialog"}
            onClose={onClose}
            owner={owner}
            contentNode={currentAction.contentNode}
          />
        )}
        <DataSourceViewDocumentModal
          owner={owner}
          dataSourceView={dataSourceView}
          documentId={currentDocumentId ?? null}
          isOpen={currentDocumentId !== undefined}
          onClose={() => {
            setCurrentDocumentId(undefined);
            onClose(false);
          }}
        />
        {currentAction.contentNode && (
          <AddToSpaceDialog
            contentNode={currentAction.contentNode}
            dataSourceView={dataSourceView}
            isOpen={currentAction.action === "AddToSpaceDialog"}
            onClose={onClose}
            owner={owner}
          />
        )}
      </>
    );
  }
);

ContentActions.displayName = "ContentActions";

// replace the existing getMenuItems function with:
export const getMenuItems = (
  canReadInSpace: boolean,
  canWriteInSpace: boolean,
  dataSourceView: DataSourceViewType,
  contentNode: DataSourceViewContentNode,
  contentActionsRef: RefObject<ContentActionsRef>
): MenuItem[] => {
  const actions: MenuItem[] = [];

  if (contentNode.sourceUrl) {
    actions.push(makeViewSourceUrlContentAction(contentNode, dataSourceView));
  }

  if (canReadInSpace && contentNode.type === "file") {
    actions.push(makeViewRawContentAction(contentNode, contentActionsRef));
  }

  if (canWriteInSpace && isFolder(dataSourceView.dataSource)) {
    actions.push({
      kind: "item",
      label: "Edit",
      icon: PencilSquareIcon,
      onClick: (e: ReactMouseEvent) => {
        e.stopPropagation();
        contentActionsRef.current?.callAction(
          contentNode.type === "database" ? "TableUploadOrEdit" : "DocumentUploadOrEdit",
          contentNode
        );
      },
    });
    actions.push({
      kind: "item",
      label: "Delete",
      icon: TrashIcon,
      onClick: (e: ReactMouseEvent) => {
        e.stopPropagation();
        contentActionsRef.current?.callAction("DocumentOrTableDeleteDialog", contentNode);
      },
      variant: "warning",
    });
  }

  if (dataSourceView.kind === "default" && isManaged(dataSourceView.dataSource) && contentNode.type === "folder") {
    actions.push({
      kind: "item",
      label: "Add to space",
      icon: PlusIcon,
      onClick: (e: ReactMouseEvent) => {
        e.stopPropagation();
        contentActionsRef.current?.callAction("AddToSpaceDialog", contentNode);
      },
    });
  }

  return actions;
};

const makeViewSourceUrlContentAction = (
  contentNode: DataSourceViewContentNode,
  dataSourceView: DataSourceViewType
): MenuItem => {
  const dataSource = dataSourceView.dataSource;
  const label = isFolder(dataSource) || isWebsite(dataSource)
    ? "View associated URL"
    : `View in ${capitalize(getDisplayNameForDataSource(dataSource))}`;

  return {
    kind: "item",
    label,
    icon: ExternalLinkIcon,
    disabled: contentNode.sourceUrl === null,
    onClick: (e: ReactMouseEvent) => {
      e.stopPropagation();
      if (contentNode.sourceUrl) {
        window.open(contentNode.sourceUrl, "_blank");
      }
    },
  };
};

const makeViewRawContentAction = (
  contentNode: DataSourceViewContentNode,
  contentActionsRef: RefObject<ContentActionsRef>
): MenuItem => {
  return {
    kind: "item",
    label: "View raw content",
    icon: EyeIcon,
    onClick: (e: ReactMouseEvent) => {
      e.stopPropagation();
      contentActionsRef.current?.callAction("DocumentViewRawContent", contentNode);
    },
  };
};
