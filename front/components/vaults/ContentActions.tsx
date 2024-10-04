import type { DataTable } from "@dust-tt/sparkle";
import {
  ExternalLinkIcon,
  EyeIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  useHashParam,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewContentNode,
  DataSourceViewType,
  PlanType,
  WorkspaceType,
} from "@dust-tt/types";
import { capitalize } from "lodash";
import type { ComponentProps, RefObject } from "react";
import React, { useEffect, useImperativeHandle, useState } from "react";

import { DocumentOrTableDeleteDialog } from "@app/components/data_source/DocumentOrTableDeleteDialog";
import { DocumentOrTableUploadOrEditModal } from "@app/components/data_source/DocumentOrTableUploadOrEditModal";
import { MultipleDocumentsUpload } from "@app/components/data_source/MultipleDocumentsUpload";
import DataSourceViewDocumentModal from "@app/components/DataSourceViewDocumentModal";
import { AddToVaultDialog } from "@app/components/vaults/AddToVaultDialog";
import {
  getDisplayNameForDataSource,
  isFolder,
  isManaged,
  isWebsite,
} from "@app/lib/data_sources";

export type ContentActionKey =
  | "DocumentUploadOrEdit"
  | "TableUploadOrEdit"
  | "MultipleDocumentsUpload"
  | "DocumentOrTableDeleteDialog"
  | "DocumentViewRawContent"
  | "AddToVaultDialog";

export type ContentAction = {
  action?: ContentActionKey;
  contentNode?: DataSourceViewContentNode;
};

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
        setCurrentDocumentId(currentAction.contentNode?.dustDocumentId ?? "");
      }
    }, [currentAction, setCurrentDocumentId]);

    const onClose = (save: boolean) => {
      // Keep current to have it during closing animation
      setCurrentAction({ contentNode: currentAction.contentNode });
      if (save) {
        onSave(currentAction.action);
      }
    };

    // TODO(2024-08-30 flav) Refactor component below to remove conditional code between
    // tables and documents which currently leads to 5xx.
    return (
      <>
        <DocumentOrTableUploadOrEditModal
          contentNode={currentAction.contentNode}
          dataSourceView={dataSourceView}
          isOpen={
            currentAction.action === "DocumentUploadOrEdit" ||
            currentAction.action === "TableUploadOrEdit"
          }
          onClose={onClose}
          owner={owner}
          plan={plan}
          totalNodesCount={totalNodesCount}
          viewType={
            currentAction.action === "TableUploadOrEdit"
              ? "tables"
              : "documents"
          }
        />
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
          <AddToVaultDialog
            contentNode={currentAction.contentNode}
            dataSourceView={dataSourceView}
            isOpen={currentAction.action === "AddToVaultDialog"}
            onClose={onClose}
            owner={owner}
          />
        )}
      </>
    );
  }
);

ContentActions.displayName = "ContentActions";

type ContentActionsMenu = ComponentProps<typeof DataTable.Row>["moreMenuItems"];

export const getMenuItems = (
  canReadInVault: boolean,
  canWriteInVault: boolean,
  dataSourceView: DataSourceViewType,
  contentNode: DataSourceViewContentNode,
  contentActionsRef: RefObject<ContentActionsRef>
): ContentActionsMenu => {
  const actions: ContentActionsMenu = [];

  // View in source:
  // We have a source for all types of docs excepts folder docs unless manually set by the user.
  if (!isFolder(dataSourceView.dataSource) || contentNode.sourceUrl) {
    actions.push(makeViewSourceUrlContentAction(contentNode, dataSourceView));
  }

  // View raw content in modal.
  if (canReadInVault && contentNode.type === "file") {
    actions.push(makeViewRawContentAction(contentNode, contentActionsRef));
  }

  // Edit & Delete:
  // We can edit/delete the documents in a Folder only.
  if (canWriteInVault && isFolder(dataSourceView.dataSource)) {
    actions.push({
      label: "Edit",
      icon: PencilSquareIcon,
      onClick: () => {
        contentActionsRef.current &&
          contentActionsRef.current?.callAction(
            contentNode.type === "database"
              ? "TableUploadOrEdit"
              : "DocumentUploadOrEdit",
            contentNode
          );
      },
    });
    actions.push({
      label: "Delete",
      icon: TrashIcon,
      onClick: () => {
        contentActionsRef.current &&
          contentActionsRef.current?.callAction(
            "DocumentOrTableDeleteDialog",
            contentNode
          );
      },
      variant: "warning",
    });
  }

  if (
    dataSourceView.kind === "default" &&
    isManaged(dataSourceView.dataSource) &&
    contentNode.type === "folder"
  ) {
    actions.push({
      label: "Add to vault",
      icon: PlusIcon,
      onClick: () => {
        contentActionsRef.current &&
          contentActionsRef.current?.callAction(
            "AddToVaultDialog",
            contentNode
          );
      },
    });
  }

  return actions;
};

const makeViewSourceUrlContentAction = (
  contentNode: DataSourceViewContentNode,
  dataSourceView: DataSourceViewType
) => {
  const dataSource = dataSourceView.dataSource;
  const label =
    isFolder(dataSource) || isWebsite(dataSource)
      ? "View associated URL"
      : `View in ${capitalize(getDisplayNameForDataSource(dataSource))}`;

  return {
    label,
    icon: ExternalLinkIcon,
    link: contentNode.sourceUrl
      ? { href: contentNode.sourceUrl, target: "_blank" }
      : undefined,
    disabled: contentNode.sourceUrl === null,
    onClick: () => {},
  };
};

const makeViewRawContentAction = (
  contentNode: DataSourceViewContentNode,
  contentActionsRef: RefObject<ContentActionsRef>
) => {
  return {
    label: "View raw content",
    icon: EyeIcon,
    onClick: () => {
      contentActionsRef.current &&
        contentActionsRef.current?.callAction(
          "DocumentViewRawContent",
          contentNode
        );
    },
  };
};
