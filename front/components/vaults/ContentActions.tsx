import type { DataTable } from "@dust-tt/sparkle";
import {
  ExternalLinkIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightContentNode,
  PlanType,
  WorkspaceType,
} from "@dust-tt/types";
import { capitalize } from "lodash";
import type { ComponentProps, RefObject } from "react";
import React, { useImperativeHandle, useState } from "react";

import { DocumentOrTableDeleteDialog } from "@app/components/data_source/DocumentOrTableDeleteDialog";
import { DocumentOrTableUploadOrEditModal } from "@app/components/data_source/DocumentOrTableUploadOrEditModal";
import { MultipleDocumentsUpload } from "@app/components/data_source/MultipleDocumentsUpload";
import DataSourceViewDocumentModal from "@app/components/DataSourceViewDocumentModal";
import { getDataSourceName } from "@app/lib/connector_providers";
import { isFolder, isWebsite } from "@app/lib/data_sources";

export type ContentActionKey =
  | "DocumentUploadOrEdit"
  | "TableUploadOrEdit"
  | "MultipleDocumentsUpload"
  | "DocumentOrTableDeleteDialog"
  | "DocumentViewRawContent";

export type ContentAction = {
  action?: ContentActionKey;
  contentNode?: LightContentNode;
};

type ContentActionsProps = {
  dataSourceView: DataSourceViewType;
  plan: PlanType;
  owner: WorkspaceType;
  onSave: (action?: ContentActionKey) => void;
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
        viewType={
          currentAction.action === "TableUploadOrEdit" ? "tables" : "documents"
        }
      />
      <MultipleDocumentsUpload
        dataSourceView={dataSourceView}
        isOpen={currentAction.action === "MultipleDocumentsUpload"}
        onClose={onClose}
        owner={owner}
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
        dataSourceView={
          currentAction.action === "DocumentViewRawContent"
            ? dataSourceView
            : null
        }
        documentId={currentAction.contentNode?.dustDocumentId ?? null}
        isOpen={currentAction.action === "DocumentViewRawContent"}
        onClose={() => onClose(false)}
      />
    </>
  );
});

ContentActions.displayName = "ContentActions";

type ContentActionsMenu = ComponentProps<typeof DataTable.Row>["moreMenuItems"];

export const getMenuItems = (
  canReadInVault: boolean,
  canWriteInVault: boolean,
  dataSourceView: DataSourceViewType,
  contentNode: LightContentNode,
  contentActionsRef: RefObject<ContentActionsRef>
): ContentActionsMenu => {
  const actions: ContentActionsMenu = [];

  // Edit & Delete
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

  // View in source
  if (canReadInVault) {
    actions.push(makeViewSourceUrlContentAction(contentNode, dataSourceView));
  }

  // View raw content in modal
  if (
    canReadInVault &&
    (contentNode.type === "file" || isWebsite(dataSourceView.dataSource))
  ) {
    actions.push(makeViewRawContentAction(contentNode, contentActionsRef));
  }

  return actions;
};

const makeViewSourceUrlContentAction = (
  contentNode: LightContentNode,
  dataSourceView: DataSourceViewType
) => {
  return {
    label: `View in ${capitalize(getDataSourceName(dataSourceView.dataSource))}`,
    icon: ExternalLinkIcon,
    link: contentNode.sourceUrl
      ? { href: contentNode.sourceUrl, target: "_blank" }
      : undefined,
    disabled: contentNode.sourceUrl === null,
    onClick: () => {},
  };
};

const makeViewRawContentAction = (
  contentNode: LightContentNode,
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
