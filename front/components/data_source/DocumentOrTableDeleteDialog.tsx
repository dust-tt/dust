import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightContentNode,
  LightWorkspaceType,
} from "@dust-tt/types";
import { DocumentDeletionKey } from "@dust-tt/types";
import * as _ from "lodash";
import { useState } from "react";

import { useQueryParams } from "@app/hooks/useQueryParams";

interface DocumentOrTableDeleteDialogProps {
  dataSourceView: DataSourceViewType | null;
  owner: LightWorkspaceType;
  contentNode: LightContentNode | null;
}

export const DocumentOrTableDeleteDialog = ({
  dataSourceView,
  owner,
  contentNode,
}: DocumentOrTableDeleteDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const params = useQueryParams(["viewType", DocumentDeletionKey]);
  const isOpen =
    params[DocumentDeletionKey].value === "true" &&
    !!dataSourceView &&
    !!contentNode;

  const sendNotification = useSendNotification();

  const isTable = params && params.viewType.value === "table";
  const itemType = isTable ? "table" : "document";

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
    if (!contentNode || !dataSourceView) {
      return;
    }
    try {
      setIsLoading(true);
      const endpoint = `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_sources/${dataSourceView.dataSource.sId}/${itemType}s/${encodeURIComponent(contentNode.internalId)}`;

      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(`Failed to delete ${itemType}`);
      }

      sendNotification({
        type: "success",
        title: `${_.capitalize(itemType)} deletion submitted`,
        description: `Deletion of ${itemType} ${contentNode.title} ongoing, it will complete shortly.`,
      });
      closeDialog();
    } catch (error) {
      sendNotification({
        type: "error",
        title: `Error deleting ${itemType}`,
        description: `An error occurred while deleting your ${itemType}.`,
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
            Are you sure you want to delete {isTable ? "table" : "document"} '
            {contentNode?.title}?
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
