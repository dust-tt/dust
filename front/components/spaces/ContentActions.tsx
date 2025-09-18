import type { MenuItem } from "@dust-tt/sparkle";
import {
  DocumentPileIcon,
  ExternalLinkIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import capitalize from "lodash/capitalize";
import type { NextRouter } from "next/router";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import React, { useCallback, useImperativeHandle, useState } from "react";

import { DocumentOrTableDeleteDialog } from "@app/components/data_source/DocumentOrTableDeleteDialog";
import { DocumentUploadOrEditModal } from "@app/components/data_source/DocumentUploadOrEditModal";
import { MultipleDocumentsUpload } from "@app/components/data_source/MultipleDocumentsUpload";
import { TableUploadOrEditModal } from "@app/components/data_source/TableUploadOrEditModal";
import DataSourceViewDocumentModal from "@app/components/DataSourceViewDocumentModal";
import {
  getDisplayNameForDataSource,
  isFolder,
  isManaged,
  isWebsite,
} from "@app/lib/data_sources";
import { setQueryParam } from "@app/lib/utils/router";
import type {
  DataSourceViewContentNode,
  DataSourceViewType,
  PlanType,
  SpaceType,
  WorkspaceType,
} from "@app/types";
import { DocumentDeletionKey, DocumentViewRawContentKey } from "@app/types";

export type UploadOrEditContentActionKey =
  | "DocumentUploadOrEdit"
  | "TableUploadOrEdit";

export type ContentActionKey =
  | UploadOrEditContentActionKey
  | "MultipleDocumentsUpload"
  | "DeleteContentNode";

export type ContentAction = {
  action?: ContentActionKey;
  contentNode?: DataSourceViewContentNode;
};

const isUploadOrEditAction = (
  action: ContentActionKey | undefined
): action is UploadOrEditContentActionKey =>
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
        <DocumentOrTableDeleteDialog
          dataSourceView={dataSourceView}
          owner={owner}
          contentNode={currentAction.contentNode ?? null}
        />
        <DataSourceViewDocumentModal
          owner={owner}
          dataSourceView={dataSourceView}
        />
      </>
    );
  }
);

ContentActions.displayName = "ContentActions";

export const getMenuItems = (
  canReadInSpace: boolean,
  canWriteInSpace: boolean,
  dataSourceView: DataSourceViewType,
  contentNode: DataSourceViewContentNode,
  contentActionsRef: RefObject<ContentActionsRef>,
  spaces: SpaceType[],
  dataSourceViews: DataSourceViewType[],
  addDataToSpace: (
    contentNode: DataSourceViewContentNode,
    spaceSId: string
  ) => void,
  router: NextRouter,
  onOpenDocument?: (node: DataSourceViewContentNode) => void,
  setEffectiveContentNode?: (node: DataSourceViewContentNode) => void
): MenuItem[] => {
  const actions: MenuItem[] = [];

  if (contentNode.sourceUrl) {
    actions.push({
      ...makeViewSourceUrlContentAction(contentNode, dataSourceView),
    });
  }

  if (canReadInSpace && contentNode.type === "document") {
    actions.push({
      ...makeViewRawContentAction(contentNode, router, onOpenDocument),
    });
  }

  if (
    canWriteInSpace &&
    isFolder(dataSourceView.dataSource) &&
    contentActionsRef.current !== null
  ) {
    actions.push({
      kind: "item",
      label: "Edit",
      icon: PencilSquareIcon,
      onClick: (e: ReactMouseEvent) => {
        e.stopPropagation();
        contentActionsRef.current?.callAction(
          contentNode.type === "table"
            ? "TableUploadOrEdit"
            : "DocumentUploadOrEdit",
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

        setQueryParam(router, DocumentDeletionKey, "true");

        // If a setter if provided, use it to set the contentNode.
        if (setEffectiveContentNode) {
          setEffectiveContentNode(contentNode);
        } else {
          // Otherwise, use the ref to set the contentNode in the delete dialog.
          contentActionsRef.current?.callAction(
            "DeleteContentNode",
            contentNode
          );
        }
        if (onOpenDocument) {
          onOpenDocument(contentNode);
        }
      },
      variant: "warning",
    });
  }

  if (
    dataSourceView.kind === "default" &&
    isManaged(dataSourceView.dataSource) &&
    contentNode.type === "folder"
  ) {
    const allViews = dataSourceViews.filter(
      (dsv) =>
        dsv.dataSource.sId === dataSourceView.dataSource.sId &&
        dsv.kind !== "default"
    );

    const alreadyInSpace = allViews
      .filter(
        (dsv) =>
          !contentNode.parentInternalIds ||
          contentNode.parentInternalIds.some(
            (parentId) => !dsv.parentsIn || dsv.parentsIn.includes(parentId)
          )
      )
      .map((dsv) => dsv.spaceId);

    const availableSpaces = spaces.filter(
      (s) => !alreadyInSpace.includes(s.sId)
    );

    actions.push({
      disabled: availableSpaces.length === 0,
      kind: "submenu",
      label: "Add to space",
      items: availableSpaces.map((s) => ({
        id: s.sId,
        name: s.name,
      })),
      onSelect: (spaceId) => addDataToSpace(contentNode, spaceId),
    });
  }

  if (
    dataSourceView.kind === "default" &&
    dataSourceView.category === "folder"
  ) {
    actions.push({
      kind: "item",
      label: "Copy DataSource ID",
      icon: DocumentPileIcon,
      onClick: (e: ReactMouseEvent) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(dataSourceView.dataSource.sId);
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
  const label =
    isFolder(dataSource) || isWebsite(dataSource)
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
  router: NextRouter,
  onOpenDocument?: (node: DataSourceViewContentNode) => void
): MenuItem => {
  return {
    kind: "item",
    label: "View raw content",
    icon: EyeIcon,
    onClick: (e: ReactMouseEvent) => {
      e.stopPropagation();
      setQueryParam(router, "documentId", contentNode.internalId);
      setQueryParam(router, DocumentViewRawContentKey, "true");
      if (onOpenDocument) {
        onOpenDocument(contentNode);
      }
    },
  };
};
