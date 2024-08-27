import { Dialog } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightContentNode,
  LightWorkspaceType,
} from "@dust-tt/types";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";

interface DocumentDeleteDialogProps {
  dataSourceView: DataSourceViewType;
  contentNode: LightContentNode;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: LightWorkspaceType;
}

export const DocumentDeleteDialog = ({
  dataSourceView,
  contentNode,
  isOpen,
  onClose,
  owner,
}: DocumentDeleteDialogProps) => {
  const sendNotification = useContext(SendNotificationsContext);
  const [loading, setLoading] = useState(false);
  const handleDeleteDocument = async () => {
    try {
      // TODO replace endpoint https://github.com/dust-tt/dust/issues/6921
      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${
          dataSourceView.dataSource.name
        }/documents/${encodeURIComponent(contentNode.internalId)}`,
        {
          method: "DELETE",
        }
      );

      if (!res.ok) {
        throw new Error("Failed to upsert document");
      }

      sendNotification({
        type: "success",
        title: "Document successfully deleted",
        description: `Document ${contentNode.internalId} was successfully deleted`,
      });
      onClose(true);
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Error deleting document",
        description: "An error occurred while deleting the document.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onCancel={() => onClose(false)}
      isSaving={loading}
      onValidate={handleDeleteDocument}
      title="Confirm deletion"
      validateVariant="primaryWarning"
      validateLabel="Delete"
    >
      <div className="mt-1 text-left">
        <p className="mb-4">
          Are you sure you want to delete the document "{contentNode.internalId}
          " ?
        </p>
        <p className="mb-4 font-bold text-warning-500">
          This action cannot be undone.
        </p>
      </div>
    </Dialog>
  );
};
