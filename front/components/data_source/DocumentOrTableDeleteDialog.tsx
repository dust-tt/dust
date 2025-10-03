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
import * as _ from "lodash";
import { useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { useQueryParams } from "@app/hooks/useQueryParams";
import type {
  DataSourceViewType,
  LightContentNode,
  LightWorkspaceType,
} from "@app/types";
import { DocumentDeletionKey } from "@app/types";

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
      !["table", "document"].includes(contentNode.type)
    ) {
      return;
    }
    try {
      setIsLoading(true);
      const endpoint = `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_sources/${dataSourceView.dataSource.sId}/${contentNode.type}s/${encodeURIComponent(contentNode.internalId)}`;

      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(`Failed to delete ${contentNode.type}`);
      }

      sendNotification({
        type: "success",
        title: `${_.capitalize(contentNode.type)} deletion submitted`,
        description:
          `Deletion of ${contentNode.type} ${contentNode.title} is ongoing, ` +
          `it will complete shortly.`,
      });

      if (onDeleteSuccess) {
        onDeleteSuccess();
      }

      closeDialog();
    } catch (error) {
      sendNotification({
        type: "error",
        title: `Error deleting ${contentNode.type}`,
        description: `An error occurred while deleting your ${contentNode.type}.`,
      });
    } finally {
      setIsLoading(false);
    }
  };

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
          <DialogTitle>Confirm deletion</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete
            {contentNode?.type ? ` ${contentNode.type}` : ""}
            {contentNode?.title ? ` '${contentNode.title}'` : ""}?
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <>
            <DialogContainer>
              <b>This action cannot be undone.</b>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
              }}
              rightButtonProps={{
                label: "Delete",
                variant: "warning",
                autoFocus: true,
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
