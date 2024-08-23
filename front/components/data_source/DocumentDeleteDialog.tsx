import { Dialog } from "@dust-tt/sparkle";
import type { DataSourceViewType, WorkspaceType } from "@dust-tt/types";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";

interface DocumentDeleteDialogProps {
  owner: WorkspaceType;
  dataSourceView: DataSourceViewType;
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  documentId: string | null;
}

export const DocumentDeleteDialog = ({
  isOpen,
  onClose,
  owner,
  dataSourceView,
  documentName,
  documentId,
}: DocumentDeleteDialogProps) => {
  const sendNotification = useContext(SendNotificationsContext);
  const [loading, setLoading] = useState(false);
  const handleDeleteDocument = async () => {
    try {
      if (!documentId) {
        return;
      }
      const res = await fetch(
        `/api/w/${owner.sId}/data_source/${
          dataSourceView.dataSource.name
        }/documents/${encodeURIComponent(documentId)}`,
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
        description: `Document ${documentId} was successfully deleted`,
      });
      onClose();
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Error deleting table",
        description: "An error occurred while deleting the document.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onCancel={onClose}
      isSaving={loading}
      onValidate={handleDeleteDocument}
      title="Confirm deletion"
      validateVariant="primaryWarning"
      validateLabel="Delete"
    >
      <div className="mt-1 text-left">
        <p className="mb-4">
          Are you sure you want to delete the document "{documentName}"?
        </p>
        <p className="mb-4 font-bold text-warning-500">
          This action cannot be undone.
        </p>
      </div>
    </Dialog>
  );
};
