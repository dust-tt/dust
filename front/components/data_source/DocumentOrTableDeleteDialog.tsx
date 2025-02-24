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
import * as _ from "lodash";
import { useState } from "react";

interface DocumentOrTableDeleteDialogProps {
  dataSourceView: DataSourceViewType;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: LightWorkspaceType;
  contentNode: LightContentNode;
}

export const DocumentOrTableDeleteDialog = ({
  dataSourceView,
  isOpen,
  onClose,
  owner,
  contentNode,
}: DocumentOrTableDeleteDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const sendNotification = useSendNotification();

  const isTable = contentNode.type === "Table" || contentNode.type === "table";
  const itemType = isTable ? "table" : "document";

  const handleDelete = async () => {
    try {
      setIsLoading(true);
      const endpoint = `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_sources/${dataSourceView.dataSource.sId}/${itemType}s/${encodeURIComponent(contentNode.internalId)}`;

      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(`Failed to delete ${itemType}`);
      }

      sendNotification({
        type: "success",
        title: `${_.capitalize(itemType)} successfully deleted`,
        description: `The ${itemType} ${contentNode.title} was deleted`,
      });
      onClose(true);
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
          onClose(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm deletion</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {isTable ? "table" : "document"} '
            {contentNode.title}'?
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
