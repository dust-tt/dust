import { useSendNotification } from "@app/hooks/useNotification";
import { useQueryParams } from "@app/hooks/useQueryParams";
import { clientFetch } from "@app/lib/egress/client";
import type { LightContentNode } from "@app/types/api/public/spaces";
import { isSpreadsheetFolderContentNode } from "@app/types/api/public/spaces";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { DocumentDeletionKey } from "@app/types/sheets";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { select } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface DocumentOrTableDeleteDialogProps {
  dataSourceView: DataSourceViewType | null;
  owner: LightWorkspaceType;
  contentNode: LightContentNode | null;
  onDeleteSuccess?: () => void;
}

export const DocumentOrTableDeleteDialog = ({
  dataSourceView,
  owner,
  contentNode,
  onDeleteSuccess,
}: DocumentOrTableDeleteDialogProps) => {
  const { t } = useLingui();
  const [isLoading, setIsLoading] = useState(false);
  const params = useQueryParams(["viewType", DocumentDeletionKey]);
  const isOpen =
    params[DocumentDeletionKey].value === "true" &&
    !!dataSourceView &&
    !!contentNode;

  const sendNotification = useSendNotification();

  const openDialog = () => {
    params.setParams({
      [DocumentDeletionKey]: "true",
    });
  };

  const closeDialog = () => {
    params.setParams({
      contentNodeId: undefined,
      contentNodeName: undefined,
      [DocumentDeletionKey]: undefined,
    });
  };

  const handleDelete = async () => {
    if (
      !contentNode ||
      !dataSourceView ||
      !(
        isSpreadsheetFolderContentNode(contentNode) ||
        ["table", "document"].includes(contentNode.type)
      )
    ) {
      return;
    }
    try {
      setIsLoading(true);
      const endpoint = `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_sources/${dataSourceView.dataSource.sId}/${contentNode.type}s/${encodeURIComponent(contentNode.internalId)}`;

      const res = await clientFetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(`Failed to delete ${contentNode.type}`);
      }

      const contentNodeType = contentNode.type;
      const contentNodeTitle = contentNode.title;
      sendNotification({
        type: "success",
        title: t`${select(contentNodeType, {
          document: "Document deletion submitted",
          table: "Table deletion submitted",
          other: "Folder deletion submitted",
        })}`,
        description: t`${select(contentNodeType, {
          document: `Deletion of document ${contentNodeTitle} is ongoing, it will complete shortly.`,
          table: `Deletion of table ${contentNodeTitle} is ongoing, it will complete shortly.`,
          other: `Deletion of folder ${contentNodeTitle} is ongoing, it will complete shortly.`,
        })}`,
      });

      if (onDeleteSuccess) {
        onDeleteSuccess();
      }

      closeDialog();
    } catch {
      const contentNodeType = contentNode.type;
      sendNotification({
        type: "error",
        title: t`${select(contentNodeType, {
          document: "Error deleting document",
          table: "Error deleting table",
          other: "Error deleting folder",
        })}`,
        description: t`${select(contentNodeType, {
          document: "An error occurred while deleting your document.",
          table: "An error occurred while deleting your table.",
          other: "An error occurred while deleting your folder.",
        })}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const contentNodeType = contentNode?.type;
  const contentNodeTitle = contentNode?.title;
  const deleteConfirmationMessage =
    contentNodeType && contentNodeTitle
      ? t`${select(contentNodeType, {
          document: `Are you sure you want to delete document “${contentNodeTitle}”?`,
          table: `Are you sure you want to delete table “${contentNodeTitle}”?`,
          other: `Are you sure you want to delete folder “${contentNodeTitle}”?`,
        })}`
      : t`Are you sure you want to delete?`;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeDialog();
        } else {
          openDialog();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Confirm deletion</Trans>
          </DialogTitle>
          <DialogDescription>{deleteConfirmationMessage}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <>
            <DialogContainer>
              <b>
                <Trans>This action cannot be undone.</Trans>
              </b>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: t`Cancel`,
                variant: "outline",
              }}
              rightButtonProps={{
                label: t`Delete`,
                variant: "warning",
                onClick: async () => {
                  void handleDelete();
                },
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
