import { Dialog } from "@dust-tt/sparkle";
import type { DataSourceViewType, WorkspaceType } from "@dust-tt/types";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";

interface DocumentDeleteDialogProps {
  dataSourceView: DataSourceViewType;
  documentId: string | null;
  documentName: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  owner: WorkspaceType;
}

export const DocumentDeleteDialog = ({
  dataSourceView,
  documentId,
  documentName,
  isOpen,
  onClose,
  onSave,
  owner,
}: DocumentDeleteDialogProps) => {
  const sendNotification = useContext(SendNotificationsContext);
  const [loading, setLoading] = useState(false);
  const handleDeleteDocument = async () => {
    try {
      if (!documentId) {
        return;
      }
      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${
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
      onSave();
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
